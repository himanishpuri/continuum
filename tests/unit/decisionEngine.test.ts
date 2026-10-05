import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "@/src/ai/agent/context";
import type { AgentDecision } from "@/src/ai/schemas/agentSchemas";

const generate = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({ generateThrows: false }));

vi.mock("@/src/ai/genkit", () => ({
  ai: { generate: (...args: unknown[]) => {
    if (mockState.generateThrows) throw new Error("model unavailable");
    return generate(...args);
  } },
  getGeminiModel: () => ({ name: "googleai/requested-model" }),
  getFallbackModels: () => [],
  retry: () => ({}),
  fallback: () => ({}),
}));
vi.mock("@/src/ai/agent/context", () => ({ buildContextBlock: () => "context" }));

import { decide } from "@/src/ai/agent/decisionEngine";

const decision: AgentDecision = {
  intent: "simple_query",
  confidence: 0.9,
  summary: "A response",
  evidenceIds: [],
  nextStep: "None",
  safetyConcern: "none",
  proposedAction: null,
  requiresApproval: false,
  clarifyingQuestion: null,
  memoryCandidates: [],
};

const request = {
  message: "Hello",
  history: [],
  context: {} as AgentContext,
  intent: {
    intent: "simple_query" as const,
    goal: "",
    missingInformation: [],
    needsClarification: false,
    clarifyingQuestion: null,
  },
};

beforeEach(() => {
  generate.mockReset();
  mockState.generateThrows = false;
});
afterEach(() => vi.restoreAllMocks());

describe("decide telemetry", () => {
  it("returns successful decision metadata and model usage", async () => {
    generate.mockResolvedValue({ output: decision, usage: { inputTokens: 12, outputTokens: 5 }, custom: { modelVersion: "gemini-served" } });

    const result = await decide(request);

    expect(result.decision).toEqual(decision);
    expect(result.meta).toMatchObject({
      model: "gemini-served",
      usage: { inputTokens: 12, outputTokens: 5 },
      repaired: false,
      degraded: false,
    });
    expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("marks thrown errors as degraded without a stack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockState.generateThrows = true;

    const result = await decide(request);

    expect(result.decision.proposedAction).toBeNull();
    expect(result.meta).toMatchObject({ degraded: true, error: "model unavailable", usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it("marks null output as degraded", async () => {
    generate.mockResolvedValue({ output: null, usage: { inputTokens: 3, outputTokens: 0 } });

    const result = await decide(request);

    expect(result.decision.intent).toBe("unclear");
    expect(result.meta).toMatchObject({ degraded: true, error: "Model returned no output", usage: { inputTokens: 3, outputTokens: 0 } });
  });

  it("repairs an invalid proposal once and sums usage across both calls", async () => {
    const proposal = {
      actionType: "SCHEDULE_CHECKIN" as const,
      parameters: { scheduledAt: "2026-10-06T00:00:00Z" },
      reason: "Follow up",
      riskLevel: "low" as const,
      requiresApproval: false,
    };
    generate
      .mockResolvedValueOnce({ output: { ...decision, proposedAction: proposal }, usage: { inputTokens: 10, outputTokens: 4 } })
      .mockResolvedValueOnce({
        output: { ...decision, proposedAction: { ...proposal, parameters: { ...proposal.parameters, message: "How is it going?" } } },
        usage: { inputTokens: 7, outputTokens: 3 },
      });

    const result = await decide(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.decision.proposedAction?.parameters).toMatchObject({ message: "How is it going?" });
    expect(result.meta).toMatchObject({ repaired: true, degraded: false, usage: { inputTokens: 17, outputTokens: 7 } });
  });

  it("does not make a repair call for an urgent decision", async () => {
    generate.mockResolvedValue({
      output: {
        ...decision,
        safetyConcern: "urgent",
        proposedAction: {
          actionType: "SCHEDULE_CHECKIN",
          parameters: {},
          reason: "Follow up",
          riskLevel: "low",
          requiresApproval: false,
        },
      },
      usage: { inputTokens: 10, outputTokens: 4 },
    });

    const result = await decide(request);

    expect(result.decision.safetyConcern).toBe("urgent");
    expect(result.meta.repaired).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
