import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getAdminAuth, isFirebaseAdminConfigured } from "./firebaseAdmin";

const COOKIE_NAME = "continuum_session";
const DEMO_PREFIX = "demo:";
const FIREBASE_PREFIX = "fb:";
export const DEMO_USER_ID = "demo-user";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  uid: string;
  isDemo: boolean;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function encodeDemoToken(uid: string, expiresAt: number): string {
  const payload = `${uid}.${expiresAt}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

function decodeDemoToken(token: string): SessionUser | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const [uid, expiresAtStr, sig] = raw.split(".");
    if (!uid || !expiresAtStr || !sig) return null;
    if (!timingSafeEqualStr(sig, sign(`${uid}.${expiresAtStr}`))) return null;
    if (Date.now() > Number(expiresAtStr)) return null;
    return { uid, isDemo: true };
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Issues the fixed demo session. Only ever allowed when DEMO_MODE=true. */
export async function createDemoSession(): Promise<void> {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Demo sessions are disabled outside DEMO_MODE.");
  }
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = DEMO_PREFIX + encodeDemoToken(DEMO_USER_ID, expiresAt);
  (await cookies()).set(COOKIE_NAME, token, cookieOptions());
}

/** Exchanges a verified Firebase ID token for a server session cookie. */
export async function createFirebaseSession(idToken: string): Promise<SessionUser> {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  (await cookies()).set(COOKIE_NAME, FIREBASE_PREFIX + sessionCookie, cookieOptions());
  return { uid: decoded.uid, isDemo: false };
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Resolves the authenticated user from the session cookie. This is the
 * only place identity is derived — every route handler calls this rather
 * than trusting any client-supplied userId.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;

  if (raw.startsWith(DEMO_PREFIX)) {
    if (process.env.DEMO_MODE !== "true") return null;
    return decodeDemoToken(raw.slice(DEMO_PREFIX.length));
  }

  if (raw.startsWith(FIREBASE_PREFIX) && isFirebaseAdminConfigured()) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(raw.slice(FIREBASE_PREFIX.length), true);
      return { uid: decoded.uid, isDemo: false };
    } catch {
      return null;
    }
  }

  return null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
