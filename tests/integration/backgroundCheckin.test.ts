import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { runDueCheckinsForUser } from "@/lib/background/runDueCheckins";

function uid() {
  return `test-bg-${randomUUID()}`;
}

function daysAgoIso(now: Date, n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seedUser(userId: string, now: Date) {
  const repos = getRepositories();
  await repos.users.createUser({
    profile: { uid: userId, name: "Test", email: null, timezone: "UTC", createdAt: now.toISOString(), isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: {
      autonomyLevel: "balanced",
      permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true },
      geminiModel: "gemini-flash-latest",
    },
  });
  return repos.plans.create(userId, {
    title: "P",
    goal: "G",
    description: "",
    schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], time: "19:00" },
    durationMinutes: 15,
    frequencyLabel: "Every day",
    status: "active",
    version: 1,
    successMetrics: [],
    checkinFrequencyDays: 7,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

describe("background check-in evaluation (§23/§24)", () => {
  it("does not intervene when adherence is strong — one miss out of five isn't panic-worthy", async () => {
    const userId = uid();
    const now = new Date();
    const repos = getRepositories();
    const plan = await seedUser(userId, now);

    for (let i = 1; i <= 5; i++) {
      await repos.events.create(userId, {
        type: i === 3 ? "SESSION_MISSED" : "SESSION_COMPLETED",
        timestamp: daysAgoIso(now, i),
        source: "system",
        payload: { durationMinutes: 15 },
        summary: "",
      });
    }
    const checkin = await repos.checkins.create(userId, {
      planId: plan.id,
      scheduledAt: new Date(now.getTime() - 1000).toISOString(),
      completedAt: null,
      status: "pending",
      message: "How's it going?",
      response: null,
      createdBy: "agent",
      createdAt: now.toISOString(),
    });

    const results = await runDueCheckinsForUser(userId, now);
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("no_action_needed");

    const updated = await repos.checkins.get(userId, checkin.id);
    expect(updated?.status).toBe("completed");
  });

  it("requests clarification and proposes a follow-up when adherence has fallen sharply", async () => {
    const userId = uid();
    const now = new Date();
    const repos = getRepositories();
    const plan = await seedUser(userId, now);

    await repos.events.create(userId, {
      type: "SESSION_COMPLETED",
      timestamp: daysAgoIso(now, 1),
      source: "system",
      payload: { durationMinutes: 15 },
      summary: "",
    });
    for (let i = 2; i <= 5; i++) {
      await repos.events.create(userId, {
        type: "SESSION_MISSED",
        timestamp: daysAgoIso(now, i),
        source: "system",
        payload: { durationMinutes: 15 },
        summary: "",
      });
    }
    await repos.checkins.create(userId, {
      planId: plan.id,
      scheduledAt: new Date(now.getTime() - 1000).toISOString(),
      completedAt: null,
      status: "pending",
      message: "How's it going?",
      response: null,
      createdBy: "agent",
      createdAt: now.toISOString(),
    });

    const results = await runDueCheckinsForUser(userId, now);
    expect(results[0].outcome).toBe("clarification_requested");

    const allCheckins = await repos.checkins.list(userId);
    expect(allCheckins.length).toBeGreaterThan(1); // original + auto-scheduled follow-up
  });
});
