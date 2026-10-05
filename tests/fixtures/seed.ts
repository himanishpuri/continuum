import { getRepositories } from "@/lib/repositories";
import type { AgentPermissions, Plan } from "@/lib/types";

export const permissions: AgentPermissions = {
  canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true,
};

export function daysAgoIso(now: Date, n: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() - n);
  return date.toISOString();
}

export async function seedUserWithPlan(userId: string): Promise<Plan> {
  const repos = getRepositories();
  const now = new Date().toISOString();
  await repos.users.createUser({
    profile: { uid: userId, name: "Test", email: null, timezone: "UTC", createdAt: now, isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: { autonomyLevel: "balanced", permissions, geminiModel: "gemini-flash-latest" },
  });
  return repos.plans.create(userId, {
    title: "Test Plan", goal: "Test", description: "",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" }, durationMinutes: 30,
    frequencyLabel: "Mon-Fri", status: "active", version: 1, successMetrics: [], checkinFrequencyDays: 7,
    createdAt: now, updatedAt: now,
  });
}

/** §49: historical 15-minute completion is 9/11; 30-minute completion is 5/13. */
export async function seedStrugglingUser(userId: string): Promise<Plan> {
  const repos = getRepositories();
  const now = new Date();
  await repos.users.createUser({
    profile: { uid: userId, name: "Test User", email: null, timezone: "UTC", createdAt: now.toISOString(), isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: { autonomyLevel: "balanced", permissions, geminiModel: "gemini-flash-latest" },
  });
  const plan = await repos.plans.create(userId, {
    title: "Evening Recovery Routine", goal: "Improve consistency", description: "",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" }, durationMinutes: 30,
    frequencyLabel: "Mon-Fri", status: "active", version: 1, successMetrics: [], checkinFrequencyDays: 7,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  for (let i = 0; i < 11; i++) await repos.events.create(userId, {
    type: i === 4 || i === 5 ? "SESSION_MISSED" : "SESSION_COMPLETED",
    timestamp: daysAgoIso(now, i + 15), source: "system", payload: { durationMinutes: 15 }, summary: "",
  });
  for (let i = 0; i < 13; i++) await repos.events.create(userId, {
    type: [0, 3, 6, 9, 12].includes(i) ? "SESSION_COMPLETED" : "SESSION_MISSED",
    timestamp: daysAgoIso(now, i + 30), source: "system", payload: { durationMinutes: 30 }, summary: "",
  });
  return plan;
}
