import type { Repositories } from "./types";
import { createLocalRepositories } from "./local";
import { createFirestoreRepositories } from "./firestore";
import { isFirebaseAdminConfigured } from "@/lib/auth/firebaseAdmin";

export type { Repositories } from "./types";

let cached: Repositories | null = null;

/** True when the app is backed by local JSON files instead of Firestore. */
export function isUsingLocalStore(): boolean {
  return process.env.DEMO_MODE === "true" || !isFirebaseAdminConfigured();
}

/**
 * Selects the Firestore or local-JSON repository implementation once per
 * process. Every caller (API routes, agent tools, background job) goes
 * through this factory so the storage backend is a single decision point.
 * Constructing the Firestore repositories doesn't touch credentials —
 * `firebase-admin` is only initialized the first time a repository method
 * actually runs — so this stays safe to call even when DEMO_MODE is on.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;
  cached = isUsingLocalStore() ? createLocalRepositories() : createFirestoreRepositories();
  return cached;
}

/**
 * §14/§31: full account deletion. Local store is one directory per user,
 * so this just removes it; Firestore's built-in `recursiveDelete` handles
 * the equivalent cascade through every subcollection under `users/{uid}`.
 */
export async function deleteAllUserData(userId: string): Promise<void> {
  if (isUsingLocalStore()) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), process.env.DEMO_DATA_DIR || ".demo-data", userId);
    await fs.rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
    return;
  }
  const { getAdminFirestore } = await import("@/lib/auth/firebaseAdmin");
  await getAdminFirestore().recursiveDelete(getAdminFirestore().collection("users").doc(userId));
}
