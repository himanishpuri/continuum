import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { approveAction, proposeAction, rejectAction } from "@/lib/tools/actionService";
import type { AgentPermissions, Plan } from "@/lib/types";

const permissions: AgentPermissions = {
  canCreateReminders: true,
  canModifyPlans: true,
  canScheduleFollowups: true,
  requireApprovalForExternalActions: true,
};

function uid() {
  return `test-action-${randomUUID()}`;
}

async function seedUserWithPlan(userId: string): Promise<Plan> {
  const repos = getRepositories();
  const now = new Date().toISOString();
  await repos.users.createUser({
    profile: { uid: userId, name: "Test", email: null, timezone: "UTC", createdAt: now, isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: { autonomyLevel: "balanced", permissions, geminiModel: "gemini-flash-latest" },
  });
  return repos.plans.create(userId, {
    title: "Test Plan",
    goal: "Test",
    description: "",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" },
    durationMinutes: 30,
    frequencyLabel: "Mon-Fri",
    status: "active",
    version: 1,
    successMetrics: [],
    checkinFrequencyDays: 7,
    createdAt: now,
    updatedAt: now,
  });
}

describe("action execution & idempotency", () => {
  it("executes a low-risk action immediately without approval", async () => {
    const userId = uid();
    await seedUserWithPlan(userId);
    const outcome = await proposeAction(userId, {
      proposal: {
        actionType: "CREATE_MEMORY",
        parameters: { type: "preference", content: "test", confidence: 0.8 },
        reason: "test",
        riskLevel: "low",
        requiresApproval: false,
      },
      evidenceIds: [],
      permissions,
      autonomyLevel: "balanced",
    });
    expect(outcome.action?.status).toBe("COMPLETED");
  });

  it("requires approval for a plan modification and only applies it after approval", async () => {
    const userId = uid();
    const plan = await seedUserWithPlan(userId);
    const outcome = await proposeAction(userId, {
      proposal: {
        actionType: "MODIFY_PLAN",
        parameters: { planId: plan.id, durationMinutes: 15, reason: "test" },
        reason: "test",
        riskLevel: "medium",
        requiresApproval: true,
      },
      evidenceIds: [],
      permissions,
      autonomyLevel: "balanced",
    });
    expect(outcome.action?.status).toBe("PENDING_APPROVAL");

    const beforeApproval = await getRepositories().plans.get(userId, plan.id);
    expect(beforeApproval?.durationMinutes).toBe(30);

    const approved = await approveAction(userId, outcome.action!.id);
    expect(approved.status).toBe("COMPLETED");

    const afterApproval = await getRepositories().plans.get(userId, plan.id);
    expect(afterApproval?.durationMinutes).toBe(15);
    expect(afterApproval?.version).toBe(2);
  });

  it("is idempotent: retrying the same idempotency key does not duplicate the effect", async () => {
    const userId = uid();
    const plan = await seedUserWithPlan(userId);
    const idempotencyKey = randomUUID();
    const proposal = {
      actionType: "SCHEDULE_CHECKIN" as const,
      parameters: { scheduledAt: new Date().toISOString(), message: "test", planId: plan.id },
      reason: "test",
      riskLevel: "low" as const,
      requiresApproval: false,
    };

    const first = await proposeAction(userId, { proposal, evidenceIds: [], permissions, autonomyLevel: "balanced", idempotencyKey });
    const second = await proposeAction(userId, { proposal, evidenceIds: [], permissions, autonomyLevel: "balanced", idempotencyKey });

    expect(first.action?.id).toBe(second.action?.id);
    expect(await getRepositories().checkins.list(userId)).toHaveLength(1);
  });

  it("does not stack a second pending check-in on the same plan", async () => {
    const userId = uid();
    const plan = await seedUserWithPlan(userId);
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const mk = (message: string) => ({
      proposal: {
        actionType: "SCHEDULE_CHECKIN" as const,
        parameters: { scheduledAt: future, message, planId: plan.id },
        reason: "test",
        riskLevel: "low" as const,
        requiresApproval: false,
      },
      evidenceIds: [],
      permissions,
      autonomyLevel: "balanced" as const,
    });

    const first = await proposeAction(userId, mk("first"));
    const second = await proposeAction(userId, mk("second"));

    expect(first.action?.status).toBe("COMPLETED");
    expect(second.action?.status).toBe("COMPLETED");
    expect((second.action?.result as { skipped?: boolean })?.skipped).toBe(true);
    expect(await getRepositories().checkins.list(userId)).toHaveLength(1);
  });

  it("marks an action FAILED (not silently corrupting state) when execution throws", async () => {
    const userId = uid();
    await seedUserWithPlan(userId);
    const outcome = await proposeAction(userId, {
      proposal: {
        actionType: "MODIFY_PLAN",
        parameters: { planId: "does-not-exist", durationMinutes: 10, reason: "test" },
        reason: "test",
        riskLevel: "medium",
        requiresApproval: true,
      },
      evidenceIds: [],
      permissions,
      autonomyLevel: "balanced",
    });
    const approved = await approveAction(userId, outcome.action!.id);
    expect(approved.status).toBe("FAILED");
    expect(approved.error).toBeTruthy();
  });

  it("rejecting a pending action leaves the underlying data untouched", async () => {
    const userId = uid();
    const plan = await seedUserWithPlan(userId);
    const outcome = await proposeAction(userId, {
      proposal: {
        actionType: "MODIFY_PLAN",
        parameters: { planId: plan.id, durationMinutes: 5, reason: "test" },
        reason: "test",
        riskLevel: "medium",
        requiresApproval: true,
      },
      evidenceIds: [],
      permissions,
      autonomyLevel: "balanced",
    });
    const rejected = await rejectAction(userId, outcome.action!.id);
    expect(rejected.status).toBe("REJECTED");

    const planAfter = await getRepositories().plans.get(userId, plan.id);
    expect(planAfter?.durationMinutes).toBe(30);
  });
});
