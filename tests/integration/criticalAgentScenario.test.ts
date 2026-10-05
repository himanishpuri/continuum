import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { sendAgentMessage } from "@/lib/agent/agentService";
import { approveAction } from "@/lib/tools/actionService";
import { scheduleFollowupCheckin } from "@/lib/agent/followup";
import { DemoAgentProvider } from "@/lib/agent/demoAgentProvider";
import { seedStrugglingUser } from "@/tests/fixtures/seed";

function uid() {
  return `test-critical-${randomUUID()}`;
}

afterEach(() => vi.restoreAllMocks());

/**
 * §49: user prefers evenings, 15-minute sessions historically complete at
 * ~82%, 30-minute sessions at ~39%, and the current plan is 30 minutes.
 * "I'm struggling to stay consistent" should surface that gap, propose
 * shortening sessions, require approval, and only touch the plan after
 * the user approves — exercising DemoAgentProvider end-to-end since this
 * test runs in DEMO_MODE.
 */
describe("critical agent scenario (§49)", () => {
  it.each([
    { summary: "I have set up a daily plan for you.", correctedClaim: true },
    { summary: "I can set up a daily plan for you.", correctedClaim: false },
  ])("keeps a pending CREATE_PLAN reply truthful: $summary", async ({ summary, correctedClaim }) => {
    const userId = uid();
    const plan = await seedStrugglingUser(userId);
    vi.spyOn(DemoAgentProvider.prototype, "handleMessage").mockResolvedValue({
      decision: {
        intent: "general_request",
        confidence: 0.9,
        summary,
        evidenceIds: [],
        nextStep: "Propose a plan",
        safetyConcern: "none",
        proposedAction: {
          actionType: "CREATE_PLAN",
          parameters: { title: "Daily Plan", goal: "Improve consistency", durationMinutes: 15, daysOfWeek: [1, 2, 3, 4, 5, 6, 0], time: "19:00" },
          reason: "A daily routine may help.",
          riskLevel: "medium",
          requiresApproval: false,
        },
        requiresApproval: false,
        clarifyingQuestion: null,
        memoryCandidates: [],
      },
      steps: [],
    });

    const result = await sendAgentMessage(userId, "Help me plan my week.");
    const repos = getRepositories();
    const action = (await repos.actions.list(userId)).at(-1);
    const run = await repos.agentRuns.get(userId, result.runId);

    expect(action).toMatchObject({ type: "CREATE_PLAN", status: "PENDING_APPROVAL" });
    expect(result.pendingApproval?.actionId).toBe(action?.id);
    expect(result.message.content).toContain(summary);
    expect(result.message.content.includes("Nothing has changed yet")).toBe(correctedClaim);
    expect(run?.correctedClaim).toBe(correctedClaim ? true : undefined);
    expect((await repos.plans.list(userId)).map((item) => item.id)).toEqual([plan.id]);
  });

  it("counts a completed direct CREATE_MEMORY proposal in the reply", async () => {
    const userId = uid();
    await seedStrugglingUser(userId);
    vi.spyOn(DemoAgentProvider.prototype, "handleMessage").mockResolvedValue({
      decision: {
        intent: "general_request",
        confidence: 0.9,
        summary: "I can remember your preference.",
        evidenceIds: [],
        nextStep: "Suggest a memory",
        safetyConcern: "none",
        proposedAction: {
          actionType: "CREATE_MEMORY",
          parameters: { type: "preference", content: "Prefers evening sessions", expiresInDays: 30 },
          reason: "Inferred from conversation.",
          riskLevel: "low",
          requiresApproval: false,
        },
        requiresApproval: false,
        clarifyingQuestion: null,
        memoryCandidates: [],
      },
      steps: [],
    });

    const result = await sendAgentMessage(userId, "I prefer evenings.");
    const memories = await getRepositories().memories.list(userId);
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({ status: "pending", requestedExpiresInDays: 30 });
    expect(result.message.content).toContain("I noted 1 thing about you");
  });

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

    // A memory candidate about the duration/completion pattern awaits review.
    const memories = await repos.memories.list(userId);
    expect(memories.some((m) => m.type === "pattern" && m.status === "pending")).toBe(true);
    expect(result.message.content).toContain("Memory page");

    await sendAgentMessage(userId, "I'm struggling to stay consistent.");
    expect((await repos.memories.list(userId)).filter((m) => m.type === "pattern" && m.status === "pending")).toHaveLength(1);

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
