import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./session";

/**
 * Resolves the caller's identity for a Route Handler, or returns a 401
 * response to short-circuit with. Keeps every route from re-implementing
 * the same "no session -> 401" check.
 */
export async function requireApiUser(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}
