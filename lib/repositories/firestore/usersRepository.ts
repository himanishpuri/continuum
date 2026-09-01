import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { UserPreferences, UserProfile, UserRecord, UserSettings } from "@/lib/types";
import type { UsersRepository } from "../types";

function doc(userId: string) {
  return getAdminFirestore().collection("users").doc(userId);
}

export function createFirestoreUsersRepository(): UsersRepository {
  return {
    async getUser(userId) {
      const snap = await doc(userId).get();
      return snap.exists ? (snap.data() as UserRecord) : null;
    },
    async createUser(user) {
      await doc(user.profile.uid).set(user);
      return user;
    },
    async updateProfile(userId, patch) {
      const record = await requireUser(userId);
      const profile: UserProfile = { ...record.profile, ...patch };
      await doc(userId).set({ profile }, { merge: true });
      return profile;
    },
    async updatePreferences(userId, patch) {
      const record = await requireUser(userId);
      const preferences: UserPreferences = { ...record.preferences, ...patch };
      await doc(userId).set({ preferences }, { merge: true });
      return preferences;
    },
    async updateSettings(userId, patch) {
      const record = await requireUser(userId);
      const settings: UserSettings = {
        ...record.settings,
        ...patch,
        permissions: { ...record.settings.permissions, ...patch.permissions },
      };
      await doc(userId).set({ settings }, { merge: true });
      return settings;
    },
  };
}

async function requireUser(userId: string): Promise<UserRecord> {
  const snap = await doc(userId).get();
  if (!snap.exists) throw new Error(`User not found: ${userId}`);
  return snap.data() as UserRecord;
}
