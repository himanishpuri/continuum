import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), created: vi.fn(), start: vi.fn(), end: vi.fn(), flush: vi.fn(), provider: vi.fn(),
}));

vi.mock("@langfuse/client", () => ({
  LangfuseClient: class {
    prompt = { get: mocks.get };
    constructor() { mocks.created(); }
  },
}));
vi.mock("@langfuse/otel", () => ({ LangfuseSpanProcessor: class {
  forceFlush = mocks.flush;
} }));
vi.mock("@langfuse/tracing", () => ({
  setLangfuseTracerProvider: mocks.provider,
  startObservation: mocks.start,
}));
vi.mock("@opentelemetry/sdk-trace-node", () => ({ NodeTracerProvider: class {} }));

async function load(enabled: boolean) {
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", enabled ? "public" : "");
  vi.stubEnv("LANGFUSE_SECRET_KEY", enabled ? "secret" : "");
  vi.resetModules();
  return import("@/src/ai/langfuse");
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.start.mockReturnValue({ end: mocks.end });
  mocks.flush.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Langfuse metadata integration", () => {
  it("does not construct or call Langfuse without both keys", async () => {
    const lf = await load(false);
    expect(await lf.fetchLabeledPrompt("agent_decision")).toBeNull();
    lf.recordDecision({} as never);
    expect(mocks.created).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("fetches a labeled text prompt", async () => {
    const lf = await load(true);
    mocks.get.mockResolvedValue({ prompt: "source", version: 7 });
    expect(await lf.fetchLabeledPrompt("agent_decision")).toMatchObject({ source: "source", version: 7 });
    expect(mocks.get).toHaveBeenCalledWith("agent_decision", expect.objectContaining({ label: "production", cacheTtlSeconds: 60 }));
  });

  it("uses PROMPT_LABEL when configured", async () => {
    vi.stubEnv("PROMPT_LABEL", "staging");
    const lf = await load(true);
    mocks.get.mockResolvedValue({ prompt: "source", version: 7 });
    await lf.fetchLabeledPrompt("agent_decision");
    expect(mocks.get).toHaveBeenCalledWith("agent_decision", expect.objectContaining({ label: "staging" }));
  });

  it("falls back on errors and timeout", async () => {
    const lf = await load(true);
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    expect(await lf.fetchLabeledPrompt("agent_decision")).toBeNull();
    vi.useFakeTimers();
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const pending = lf.fetchLabeledPrompt("agent_decision");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBeNull();
  });

  it("falls back if client construction fails", async () => {
    const lf = await load(true);
    mocks.created.mockImplementationOnce(() => { throw new Error("bad configuration"); });
    expect(await lf.fetchLabeledPrompt("agent_decision")).toBeNull();
  });

  it("records only metadata, usage, and a pinned prompt reference", async () => {
    const lf = await load(true);
    const client = { name: "agent_decision", version: 3, isFallback: false } as never;
    lf.recordDecision({
      model: "gemini", prompt: "agent_decision@1#abcd1234", promptSource: "langfuse", tools: "tools", outputSchema: "schema",
      guardrails: "guard", release: "1234567", latencyMs: 12, degraded: false, repaired: false,
      safetyConcern: "none", intent: "simple_query", usage: { inputTokens: 10, outputTokens: 2 },
    }, client);
    const [name, payload, options] = mocks.start.mock.calls[0];
    expect(name).toBe("agent_decision");
    expect(options).toEqual({ asType: "generation" });
    expect(payload).toMatchObject({ prompt: client, usageDetails: { input: 10, output: 2 }, metadata: { prompt: "agent_decision@1#abcd1234" } });
    for (const field of ["input", "output", "userId"]) {
      expect(payload).not.toHaveProperty(field);
      expect(payload.metadata).not.toHaveProperty(field);
    }
    expect(mocks.end).toHaveBeenCalledOnce();
    await lf.flushLangfuse();
    expect(mocks.flush).toHaveBeenCalledOnce();
  });
});
