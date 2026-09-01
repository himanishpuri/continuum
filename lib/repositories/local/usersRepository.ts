import type { UserPreferences, UserProfile, UserRecord, UserSettings } from "@/lib/types";
import type { UsersRepository } from "../types";
import { readDoc, writeDoc } from "./jsonStore";

const SEGMENTS = ["user"];

export function createLocalUsersRepository(): UsersRepository {
  return {
    async getUser(userId) {
      return readDoc<UserRecord>(userId, SEGMENTS);
    },
    async createUser(user) {
      await writeDoc(user.profile.uid, SEGMENTS, user);
      return user;
    },
    async updateProfile(userId, patch) {
      const record = await requireUser(userId);
      const profile: UserProfile = { ...record.profile, ...patch };
      await writeDoc(userId, SEGMENTS, { ...record, profile });
      return profile;
    },
    async updatePreferences(userId, patch) {
      const record = await requireUser(userId);
      const preferences: UserPreferences = { ...record.preferences, ...patch };
      await writeDoc(userId, SEGMENTS, { ...record, preferences });
      return preferences;
    },
    async updateSettings(userId, patch) {
      const record = await requireUser(userId);
      const settings: UserSettings = {
        ...record.settings,
        ...patch,
        permissions: { ...record.settings.permissions, ...patch.permissions },
      };
      await writeDoc(userId, SEGMENTS, { ...record, settings });
      return settings;
    },
  };
}

async function requireUser(userId: string): Promise<UserRecord> {
  const record = await readDoc<UserRecord>(userId, SEGMENTS);
  if (!record) throw new Error(`User not found: ${userId}`);
  return record;
}
