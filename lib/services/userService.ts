import { getRepositories } from "@/lib/repositories";
import type { UserRecord } from "@/lib/types";
import { DEMO_USER_ID } from "@/lib/auth/session";

function defaultUserRecord(uid: string, opts?: { name?: string; email?: string | null }): UserRecord {
  return {
    profile: {
      uid,
      name: opts?.name ?? (uid === DEMO_USER_ID ? "Alex" : "there"),
      email: opts?.email ?? null,
      timezone: "UTC",
      createdAt: new Date().toISOString(),
      isDemo: uid === DEMO_USER_ID,
    },
    preferences: {
      preferredSessionTime: "19:00",
      preferredDurationMinutes: 20,
      communicationStyle: "supportive",
      reminderEnabled: true,
    },
    settings: {
      autonomyLevel: "balanced",
      permissions: {
        canCreateReminders: true,
        canModifyPlans: true,
        canScheduleFollowups: true,
        requireApprovalForExternalActions: true,
      },
      geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
    },
  };
}

/**
 * Returns the user's record, creating a fresh one with sensible defaults
 * on first sign-in. The demo user is normally pre-populated by
 * scripts/seed-demo.ts, but this keeps the app from breaking if it hasn't
 * been run yet.
 */
export async function getOrCreateUser(uid: string, opts?: { name?: string; email?: string | null }): Promise<UserRecord> {
  const repos = getRepositories();
  const existing = await repos.users.getUser(uid);
  if (existing) return existing;
  return repos.users.createUser(defaultUserRecord(uid, opts));
}
