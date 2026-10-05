import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { PATCH } from "@/app/api/checkins/[id]/route";
import { buildAgentContext, buildContextBlock } from "@/src/ai/agent/context";
import { adherenceDecision, DemoAgentProvider } from "@/lib/agent/demoAgentProvider";
import type { CommunicationStyle } from "@/lib/types";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/apiAuth", () => ({ requireApiUser: async () => ({ user: { uid: state.userId } }) }));

describe("check-in self-report", () => {
  it("validates ownership and confidence, adds context, and biases a borderline smaller-step proposal", async () => {
    const repos = getRepositories();
    const owner = `reply-${randomUUID()}`;
    const now = new Date();
    const iso = now.toISOString();
    await repos.users.createUser({
      profile: { uid: owner, name: "Test", email: null, timezone: "UTC", createdAt: iso, isDemo: true },
      preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
      settings: { autonomyLevel: "balanced", permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true }, geminiModel: "gemini-flash-latest" },
    });
    const plan = await repos.plans.create(owner, {
      title: "Routine", goal: "Consistency", description: "", schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" },
      durationMinutes: 30, frequencyLabel: "Mon-Fri", status: "active", version: 1, successMetrics: [], checkinFrequencyDays: 7, createdAt: iso, updatedAt: iso,
    });
    // Current 30-minute completion: 5/10; shorter 15-minute completion: 3/5.
    for (const [durationMinutes, completed, total] of [[30, 5, 10], [15, 3, 5]]) {
      for (let i = 0; i < total; i++) await repos.events.create(owner, {
        type: i < completed ? "SESSION_COMPLETED" : "SESSION_MISSED", timestamp: iso,
        source: "user", payload: { durationMinutes }, summary: "Session",
      });
    }
    const checkin = await repos.checkins.create(owner, {
      planId: plan.id, scheduledAt: iso, completedAt: iso, status: "completed", message: "How is it going?",
      response: "A small dip.", createdBy: "agent", createdAt: iso,
    });
    const params = { params: Promise.resolve({ id: checkin.id }) };
    const request = (body: unknown) => new Request("http://localhost/api/checkins/id", { method: "PATCH", body: JSON.stringify(body) });
    state.userId = `other-${randomUUID()}`;
    expect((await PATCH(request({ confidence: 4 }), params)).status).toBe(404);
    state.userId = owner;
    expect((await PATCH(request({ confidence: 11 }), params)).status).toBe(400);
    expect((await PATCH(request({ confidence: 4, note: "x".repeat(501) }), params)).status).toBe(400);
    const before = await buildAgentContext(owner);
    expect(adherenceDecision(before).proposedAction?.actionType).not.toBe("MODIFY_PLAN");
    expect((await PATCH(request({ confidence: 4, note: "The long session feels hard" }), params)).status).toBe(200);
    expect((await PATCH(request({ confidence: 8 }), params)).status).toBe(409);
    const after = await buildAgentContext(owner);
    expect(buildContextBlock(after)).toContain("Confidence: 4/10");
    expect(adherenceDecision(after).proposedAction?.parameters.durationMinutes).toBe(15);
    const styled = (style: CommunicationStyle) => ({
      ...after, user: { ...after.user, preferences: { ...after.user.preferences, communicationStyle: style } },
    });
    const summaries = (["concise", "supportive", "direct"] as const).map((style) => adherenceDecision(styled(style)).summary);
    expect(new Set(summaries).size).toBe(3);
    for (const summary of summaries) expect(summary).toMatch(/would you like|would it be okay|may I/i);
    const provider = new DemoAgentProvider();
    for (const intentName of ["simple_query", "general_request"] as const) {
      const replies = await Promise.all((["concise", "supportive", "direct"] as const).map(async (style) =>
        (await provider.handleMessage({
          userId: owner, message: "Help", history: [], context: styled(style),
          intent: { intent: intentName, goal: "", missingInformation: [], needsClarification: false, clarifyingQuestion: null },
        })).decision.summary));
      expect(new Set(replies).size).toBe(3);
    }
    expect((await repos.events.list(owner)).some((event) => event.type === "CHECKIN_COMPLETED" && event.source === "user" && event.payload.kind === "self_report")).toBe(true);
  });
});
