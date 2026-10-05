import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { sendAgentMessage } from "@/lib/agent/agentService";
import { DemoAgentProvider } from "@/lib/agent/demoAgentProvider";
import { SAFETY_RESPONSE } from "@/src/ai/agent/prompts";

async function createUser() {
  const userId = `test-safety-${randomUUID()}`;
  const now = new Date().toISOString();
  await getRepositories().users.createUser({
    profile: { uid: userId, name: "Test User", email: null, timezone: "UTC", createdAt: now, isDemo: true },
    preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
    settings: {
      autonomyLevel: "balanced",
      permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true },
      geminiModel: "gemini-flash-latest",
    },
  });
  return userId;
}

afterEach(() => vi.restoreAllMocks());

describe("agent safety stops", () => {
  it("records a keyword safety completion without calling the provider", async () => {
    const userId = await createUser();
    const handleMessage = vi.spyOn(DemoAgentProvider.prototype, "handleMessage");
    const result = await sendAgentMessage(userId, "I want to die");
    const repos = getRepositories();

    expect(handleMessage).not.toHaveBeenCalled();
    expect(result.message.content).toBe(SAFETY_RESPONSE);
    expect(result.pendingApproval).toBeNull();
    expect((await repos.agentRuns.get(userId, result.runId))?.safetyStop).toBe(true);
    expect((await repos.events.list(userId)).find((event) => event.type === "AGENT_COMPLETED")).toMatchObject({
      payload: { runId: result.runId, safety: true, layer: "keyword" },
      summary: "Responded with safety resources",
    });
  });

  it("discards an urgent model decision's action and memory candidates", async () => {
    const userId = await createUser();
    vi.spyOn(DemoAgentProvider.prototype, "handleMessage").mockResolvedValue({
      decision: {
        intent: "general_request",
        confidence: 0.9,
        summary: "Unsafe model response",
        evidenceIds: [],
        nextStep: "Propose a check-in",
        safetyConcern: "urgent",
        proposedAction: {
          actionType: "SCHEDULE_CHECKIN",
          parameters: { scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), message: "How are you?" },
          reason: "Follow up",
          riskLevel: "low",
          requiresApproval: false,
        },
        requiresApproval: false,
        clarifyingQuestion: "Unsafe follow-up question?",
        memoryCandidates: [{ type: "preference", content: "Store this", confidence: 0.9, expiresInDays: null }],
      },
      steps: ["Model decision ready"],
      meta: { model: "safety-test", latencyMs: 7, usage: { inputTokens: 12, outputTokens: 3 }, repaired: false, degraded: false },
    });

    const result = await sendAgentMessage(userId, "Could you help me with my routine?");
    const repos = getRepositories();
    const run = await repos.agentRuns.get(userId, result.runId);

    expect(result.message.content).toBe(SAFETY_RESPONSE);
    expect(result.pendingApproval).toBeNull();
    expect(await repos.actions.list(userId)).toEqual([]);
    expect(await repos.memories.list(userId)).toEqual([]);
    expect(run?.safetyStop).toBe(true);
    expect(run).toMatchObject({ model: "safety-test", latencyMs: 7, usage: { inputTokens: 12, outputTokens: 3 }, degraded: false, intent: "improve_adherence", confidence: 0.9 });
    expect(run?.steps.map((step) => step.label)).toContain("Detected a safety-sensitive message");
    expect((await repos.events.list(userId)).find((event) => event.type === "AGENT_COMPLETED")).toMatchObject({
      payload: { runId: result.runId, safety: true, layer: "model" },
      summary: "Responded with safety resources",
    });
  });

  it("records a degraded model error on a normal completed run", async () => {
    const userId = await createUser();
    vi.spyOn(DemoAgentProvider.prototype, "handleMessage").mockResolvedValue({
      decision: {
        intent: "general_request",
        confidence: 0,
        summary: "Please try again.",
        evidenceIds: [],
        nextStep: "Await another message",
        safetyConcern: "none",
        proposedAction: null,
        requiresApproval: false,
        clarifyingQuestion: null,
        memoryCandidates: [],
      },
      meta: { model: "test", latencyMs: 1, usage: { inputTokens: 0, outputTokens: 0 }, repaired: false, degraded: true },
      steps: [],
    });

    const result = await sendAgentMessage(userId, "Could you help me with my routine?");
    expect(await getRepositories().agentRuns.get(userId, result.runId)).toMatchObject({
      status: "completed",
      degraded: true,
      error: "Model call degraded",
    });
  });
});
