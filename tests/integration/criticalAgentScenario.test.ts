import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { sendAgentMessage } from "@/lib/agent/agentService";
import { approveAction } from "@/lib/tools/actionService";
import { scheduleFollowupCheckin } from "@/lib/agent/followup";

function uid() {
  return `test-critical-${randomUUID()}`;
}

function daysAgoIso(now: Date, n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * §49: user prefers evenings, 15-minute sessions historically complete at
 * ~82%, 30-minute sessions at ~39%, and the current plan is 30 minutes.
 * "I'm struggling to stay consistent" should surface that gap, propose
 * shortening sessions, require approval, and only touch the plan after
 * the user approves — exercising DemoAgentProvider end-to-end since this
 * test runs in DEMO_MODE.
 */
async function seedStrugglingUser(userId: string) {
  const repos = getRepositories();
  const now = new Date();
  await repos.users.createUser({
    profile: { uid: userId, name: "Test User", email: null, timezone: "UTC", createdAt: now.toISOString(), isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: {
      autonomyLevel: "balanced",
      permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true },
      geminiModel: "gemini-flash-latest",
    },
  });

  const plan = await repos.plans.create(userId, {
    title: "Evening Recovery Routine",
    goal: "Improve consistency",
    description: "",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" },
    durationMinutes: 30,
    frequencyLabel: "Mon-Fri",
    status: "active",
    version: 1,
    successMetrics: [],
    checkinFrequencyDays: 7,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  // 15-minute sessions: 9/11 completed ≈ 82%
  for (let i = 0; i < 11; i++) {
    const missed = i === 4 || i === 5;
    await repos.events.create(userId, {
      type: missed ? "SESSION_MISSED" : "SESSION_COMPLETED",
      timestamp: daysAgoIso(now, i + 15),
      source: "system",
      payload: { durationMinutes: 15 },
      summary: "",
    });
  }
  // 30-minute sessions: 5/13 completed ≈ 39%
  for (let i = 0; i < 13; i++) {
    const completed = [0, 3, 6, 9, 12].includes(i);
    await repos.events.create(userId, {
      type: completed ? "SESSION_COMPLETED" : "SESSION_MISSED",
      timestamp: daysAgoIso(now, i + 30),
      source: "system",
      payload: { durationMinutes: 30 },
      summary: "",
    });
  }

  return plan;
}

describe("critical agent scenario (§49)", () => {
  it("proposes shorter sessions gated by approval, then completes the full lifecycle once approved", async () => {
    const userId = uid();
    const plan = await seedStrugglingUser(userId);
    const repos = getRepositories();

    const result = await sendAgentMessage(userId, "I'm struggling to stay consistent.");
    expect(result.pendingApproval).not.toBeNull();

    const planBeforeApproval = await repos.plans.get(userId, plan.id);
    expect(planBeforeApproval?.durationMinutes).toBe(30);
    expect(planBeforeApproval?.version).toBe(1);

    const approvedAction = await approveAction(userId, result.pendingApproval!.actionId);
    expect(approvedAction.status).toBe("COMPLETED");
    expect(approvedAction.type).toBe("MODIFY_PLAN");

    const planAfterApproval = await repos.plans.get(userId, plan.id);
    expect(planAfterApproval?.durationMinutes).toBe(15);
    expect(planAfterApproval?.version).toBe(2);

    const versions = await repos.planVersions.listByPlan(userId, plan.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(2);

    // A memory candidate about the duration/completion pattern should have been persisted.
    const memories = await repos.memories.list(userId);
    expect(memories.some((m) => m.type === "pattern")).toBe(true);

    // Approving triggers the audit trail (§58).
    const events = await repos.events.list(userId);
    expect(events.some((e) => e.type === "ACTION_APPROVED")).toBe(true);
    expect(events.some((e) => e.type === "PLAN_UPDATED")).toBe(true);

    // The follow-up check-in the API route schedules after approval (§1/§28).
    const followupCheckinId = await scheduleFollowupCheckin(userId, approvedAction);
    expect(followupCheckinId).not.toBeNull();
    const checkins = await repos.checkins.list(userId);
    expect(checkins).toHaveLength(1);
  });

  it("answers a simple factual question without proposing any action", async () => {
    const userId = uid();
    await seedStrugglingUser(userId);
    const result = await sendAgentMessage(userId, "What's my next session?");
    expect(result.pendingApproval).toBeNull();
    expect(result.message.cards.find((c) => c.kind === "plan_proposal" || c.kind === "action_approval")).toBeUndefined();
  });

  it("asks a clarifying question when there is nothing to act on", async () => {
    const userId = uid();
    const repos = getRepositories();
    const now = new Date().toISOString();
    await repos.users.createUser({
      profile: { uid: userId, name: "New User", email: null, timezone: "UTC", createdAt: now, isDemo: true },
      preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
      settings: {
        autonomyLevel: "balanced",
        permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true },
        geminiModel: "gemini-flash-latest",
      },
    });

    const result = await sendAgentMessage(userId, "hi");
    expect(result.message.content.length).toBeGreaterThan(0);
    expect(result.pendingApproval).toBeNull();
  });
});
