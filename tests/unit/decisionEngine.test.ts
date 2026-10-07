import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "@/src/ai/agent/context";
import type { AgentDecision } from "@/src/ai/schemas/agentSchemas";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PROMPT_PINS } from "@/src/ai/promptPins";

const generate = vi.hoisted(() => vi.fn());
const fetchPrompt = vi.hoisted(() => vi.fn());
const definePrompt = vi.hoisted(() => vi.fn());
const recordTrace = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({ generateThrows: false }));

vi.mock("@/src/ai/genkit", () => ({
  ai: { prompt: () => ({ render: async () => ({ messages: [] }) }), definePrompt, generate: (...args: unknown[]) => {
    if (mockState.generateThrows) throw new Error("model unavailable");
    return generate(...args);
  } },
  getGeminiModel: () => ({ name: "googleai/requested-model" }),
  getFallbackModels: () => [],
  retry: () => ({}),
  fallback: () => ({}),
}));
vi.mock("@/src/ai/agent/context", () => ({ buildContextBlock: () => "context" }));
vi.mock("@/src/ai/langfuse", () => ({ fetchLabeledPrompt: fetchPrompt, recordDecision: recordTrace }));

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
  userId: "test-user",
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
  fetchPrompt.mockReset().mockResolvedValue(null);
  definePrompt.mockReset();
  recordTrace.mockReset();
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
      prompt: expect.stringMatching(/^agent_decision@1#[a-f0-9]{8}$/),
      usage: { inputTokens: 12, outputTokens: 5 },
      repaired: false,
      degraded: false,
    });
    expect(result.meta.latencyMs).toBeGreaterThanOrEqual(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(recordTrace).toHaveBeenCalledWith(expect.objectContaining({ prompt: result.meta.prompt, promptSource: "bundled" }), undefined);
  });

  it("serves pinned Langfuse source and records its source", async () => {
    const source = readFileSync("prompts/agent_decision.prompt", "utf8")
      .replace(/^version: 1$/m, "version: 2").replace("You are Continuum", "You are Continuum from Langfuse");
    const hash = createHash("sha256").update(source).digest("hex");
    PROMPT_PINS.agent_decision["2"] = hash;
    fetchPrompt.mockResolvedValue({ source, version: 7, client: { name: "agent_decision", version: 7 } });
    generate.mockResolvedValue({ output: decision, usage: {} });
    try {
      const result = await decide(request);
      expect(result.meta).toMatchObject({ prompt: `agent_decision@2#${hash.slice(0, 8)}`, promptSource: "langfuse" });
      expect(definePrompt).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.stringContaining("Continuum from Langfuse") }));
      expect(recordTrace).toHaveBeenCalledWith(expect.objectContaining({ promptSource: "langfuse" }), expect.objectContaining({ version: 7 }));
    } finally { delete PROMPT_PINS.agent_decision["2"]; }
  });

  it("uses bundled source when Langfuse text is unpinned", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchPrompt.mockResolvedValue({ source: "---\nversion: 99\n---\nunreviewed", version: 9 });
    generate.mockResolvedValue({ output: decision, usage: {} });
    const result = await decide(request);
    expect(result.meta.promptSource).toBe("bundled");
    expect(result.meta.prompt).toMatch(/^agent_decision@1#/);
    expect(definePrompt).not.toHaveBeenCalled();
  });

  it("keeps the turn when trace recording fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recordTrace.mockImplementation(() => { throw new Error("trace offline"); });
    generate.mockResolvedValue({ output: decision, usage: {} });
    expect((await decide(request)).decision).toEqual(decision);
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
