import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const getPrompt = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/client", () => ({ LangfuseClient: class {
  prompt = { get: getPrompt };
  constructor() { constructed(); }
} }));

async function load(enabled: boolean) {
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", enabled ? "public" : "");
  vi.stubEnv("LANGFUSE_SECRET_KEY", enabled ? "secret" : "");
  vi.resetModules();
  const lf = await import("@/src/ai/langfuse");
  const exporter = new InMemorySpanExporter();
  if (enabled) lf.__setLangfuseProviderForTest(new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
  return { lf, exporter };
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); getPrompt.mockReset(); constructed.mockReset(); });

describe("Langfuse tracing", () => {
  it("is a no-op without keys, including provider and client construction", async () => {
    const { lf } = await load(false);
    expect(await lf.fetchLabeledPrompt("agent_decision")).toBeNull();
    expect(await lf.traced("step", "chain", { input: "text" }, () => 42)).toBe(42);
    expect(await lf.traceTurn("handle-chat-turn", "raw", "conversation", "chat", "text", async () => 43)).toBe(43);
    expect(constructed).not.toHaveBeenCalled();
  });

  it("fetches prompt candidates with label and fails closed", async () => {
    const { lf } = await load(true);
    getPrompt.mockResolvedValueOnce({ prompt: "source", version: 7 });
    expect(await lf.fetchLabeledPrompt("agent_decision")).toMatchObject({ source: "source", version: 7 });
    expect(getPrompt).toHaveBeenCalledWith("agent_decision", expect.objectContaining({ label: "production", cacheTtlSeconds: 60 }));
    getPrompt.mockRejectedValueOnce(new Error("offline"));
    expect(await lf.fetchLabeledPrompt("agent_decision")).toBeNull();
  });

  it("uses the configured prompt label and times out", async () => {
    vi.stubEnv("PROMPT_LABEL", "staging");
    const { lf } = await load(true);
    getPrompt.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    const pending = lf.fetchLabeledPrompt("agent_decision");
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBeNull();
    expect(getPrompt).toHaveBeenCalledWith("agent_decision", expect.objectContaining({ label: "staging" }));
  });

  it("masks emails and phone numbers recursively", async () => {
    const { lf } = await load(false);
    expect(lf.maskTraceData({ input: ["Reach me at Jane.Doe@example.com or +1 (415) 555-0101"] })).toEqual({
      input: ["Reach me at [redacted: email] or [redacted: phone]"],
    });
  });

  it("applies the mask in the Langfuse processor before export", async () => {
    const { lf } = await load(true);
    const exporter = new InMemorySpanExporter();
    const processor = new LangfuseSpanProcessor({ exporter, exportMode: "immediate", publicKey: "public", secretKey: "secret",
      mask: ({ data }) => lf.maskTraceData(data) });
    lf.__setLangfuseProviderForTest(new NodeTracerProvider({ spanProcessors: [processor] }));
    await lf.traceTurn("handle-chat-turn", "user", "conversation", "chat", "Jane@example.com +1 (415) 555-0101", async (root) => {
      await lf.traced("metadata-step", "chain", { metadata: { note: "Write Jane@example.com or +1 (415) 555-0101" } }, () => undefined);
      root?.update({ output: "Call 415-555-0101" });
    });
    await processor.forceFlush();
    const exported = JSON.stringify(exporter.getFinishedSpans().map((span) => span.attributes));
    expect(exported).toContain("[redacted: email]");
    expect(exported).toContain("[redacted: phone]");
    expect(exported).not.toContain("Jane@example.com");
    expect(exported).not.toContain("415-555-0101");
    expect(exported).toContain("langfuse.observation.metadata.note");
  });

  it("continues the operation if tracer startup fails", async () => {
    const { lf } = await load(true);
    lf.__setLangfuseProviderForTest({ getTracer: () => { throw new Error("tracer failed"); } } as unknown as NodeTracerProvider);
    expect(await lf.traced("step", "chain", {}, () => "completed")).toBe("completed");
  });

  it("nests observations and propagates pseudonymous user, session, tags, and release", async () => {
    const { lf, exporter } = await load(true);
    await lf.traceTurn("handle-chat-turn", "raw-user", "conversation-1", "chat", "hello", async (root) => {
      await lf.traced("build-context", "retriever", {}, (step) => { step?.update({ output: { memories: 0 } }); });
      root?.update({ output: "hi" });
    });
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["build-context", "handle-chat-turn"]);
    const [child, root] = spans;
    expect(child.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    expect(root.attributes["langfuse.observation.type"]).toBe("agent");
    expect(child.attributes["langfuse.observation.type"]).toBe("retriever");
    expect(root.attributes["user.id"]).toBe(createHmac("sha256", process.env.SESSION_SECRET ?? "continuum").update("raw-user").digest("hex").slice(0, 16));
    expect(root.attributes["session.id"]).toBe("conversation-1");
    expect(JSON.stringify(root.attributes)).toContain("chat");
    expect(JSON.stringify(root.attributes)).not.toContain("raw-user");
  });

  it("traces demo turns and redacts every safety span before export", async () => {
    const { lf, exporter } = await load(true);
    const { getRepositories } = await import("@/lib/repositories");
    const { sendAgentMessage } = await import("@/lib/agent/agentService");
    const userId = `trace-${randomUUID()}`;
    const now = new Date().toISOString();
    await getRepositories().users.createUser({
      profile: { uid: userId, name: "Trace User", email: null, timezone: "UTC", createdAt: now, isDemo: true },
      preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: false },
      settings: { autonomyLevel: "balanced", permissions: { canCreateReminders: true, canModifyPlans: true, canScheduleFollowups: true, requireApprovalForExternalActions: true }, geminiModel: "gemini-flash-latest" },
    });
    const normal = await sendAgentMessage(userId, "How is my plan?");
    const normalSpans = exporter.getFinishedSpans();
    const root = normalSpans.find((span) => span.name === "handle-chat-turn")!;
    expect(root.attributes["session.id"]).toBe(normal.conversationId);
    expect(root.attributes["langfuse.observation.type"]).toBe("agent");
    expect(normalSpans.map((span) => span.name)).toEqual(expect.arrayContaining([
      "check-safety-keywords", "build-context", "classify-intent", "decide-rules", "verify-memories", "check-completion-claim", "handle-chat-turn",
    ]));
    expect(normalSpans.filter((span) => span !== root).every((span) => span.parentSpanContext?.spanId === root.spanContext().spanId)).toBe(true);
    exporter.reset();
    const crisis = "I want to die; call me on +1 (415) 555-0101";
    await sendAgentMessage(userId, crisis, normal.conversationId);
    const safetySpans = exporter.getFinishedSpans();
    expect(safetySpans.map((span) => span.name)).toEqual(["check-safety-keywords", "handle-chat-turn"]);
    for (const span of safetySpans) expect(JSON.stringify(span.attributes)).not.toContain("want to die");
    const safetyRoot = safetySpans.find((span) => span.name === "handle-chat-turn")!;
    expect(safetyRoot.attributes["langfuse.observation.input"]).toBe(lf.SAFETY_REDACTION);
    expect(safetyRoot.attributes["langfuse.observation.output"]).toBe(lf.SAFETY_REDACTION);
  });

  it("redacts earlier context and decision spans for a model-flagged urgent stop", async () => {
    const { exporter } = await load(true);
    const { seedUserWithPlan } = await import("@/tests/fixtures/seed");
    const { DemoAgentProvider } = await import("@/lib/agent/demoAgentProvider");
    const { sendAgentMessage } = await import("@/lib/agent/agentService");
    const userId = `urgent-${randomUUID()}`;
    await seedUserWithPlan(userId);
    vi.spyOn(DemoAgentProvider.prototype, "handleMessage").mockResolvedValue({
      decision: { intent: "simple_query", confidence: 0.9, summary: "sensitive reply", evidenceIds: [], nextStep: "stop",
        safetyConcern: "urgent", proposedAction: null, requiresApproval: false, clarifyingQuestion: null, memoryCandidates: [] },
      steps: [],
    });
    const message = "I feel hopeless about tomorrow";
    await sendAgentMessage(userId, message);
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(expect.arrayContaining(["build-context", "classify-intent", "decide-rules", "handle-chat-turn"]));
    for (const span of spans) {
      expect(JSON.stringify(span.attributes)).not.toContain(message);
      expect(JSON.stringify(span.attributes)).not.toContain("sensitive reply");
    }
    // Steps end on exit with ids/counts only; text-bearing observations carry the marker.
    const root = spans.find((span) => span.name === "handle-chat-turn")!;
    expect(root.attributes["langfuse.observation.input"]).toBe("[redacted: safety stop]");
    expect(root.attributes["langfuse.observation.output"]).toBe("[redacted: safety stop]");
    expect(spans.find((span) => span.name === "decide-rules")!.attributes["langfuse.observation.output"]).toBe("[redacted: safety stop]");
  });

  it("records policy, approval parking, and executed tools under an agent", async () => {
    const { lf, exporter } = await load(true);
    const { seedUserWithPlan } = await import("@/tests/fixtures/seed");
    const { getRepositories } = await import("@/lib/repositories");
    const { proposeAction } = await import("@/lib/tools/actionService");
    const userId = `actions-${randomUUID()}`;
    await seedUserWithPlan(userId);
    const user = (await getRepositories().users.getUser(userId))!;
    await lf.traceTurn("handle-chat-turn", userId, "conversation", "chat", "action", async () => {
      const common = { evidenceIds: [], permissions: user.settings.permissions, autonomyLevel: user.settings.autonomyLevel };
      const pending = await proposeAction(userId, { ...common, proposal: {
        actionType: "CREATE_PLAN", parameters: {}, reason: "Propose a plan", riskLevel: "medium", requiresApproval: true,
      } });
      const executed = await proposeAction(userId, { ...common, proposal: {
        actionType: "SCHEDULE_CHECKIN", parameters: { scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), message: "Follow up" },
        reason: "Follow up", riskLevel: "low", requiresApproval: false,
      } });
      expect(pending.action?.status).toBe("PENDING_APPROVAL");
      expect(executed.action?.status).toBe("COMPLETED");
    });
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => [span.name, span.attributes["langfuse.observation.type"]])).toEqual([
      ["evaluate-policy", "guardrail"], ["park-for-approval", "event"],
      ["evaluate-policy", "guardrail"], ["execute-action", "tool"], ["handle-chat-turn", "agent"],
    ]);
    expect(spans[1].attributes["langfuse.observation.output"]).toContain("PENDING_APPROVAL");
    const root = spans.at(-1)!;
    expect(spans.slice(0, -1).every((span) => span.parentSpanContext?.spanId === root.spanContext().spanId)).toBe(true);
  });

  it("creates one background agent trace per due check-in with rules, policy, and tool children", async () => {
    const { exporter } = await load(true);
    const { seedUserWithPlan } = await import("@/tests/fixtures/seed");
    const { getRepositories } = await import("@/lib/repositories");
    const { runDueCheckinsForUser } = await import("@/lib/background/runDueCheckins");
    const userId = `background-${randomUUID()}`;
    const now = new Date("2026-10-07T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const plan = await seedUserWithPlan(userId);
    const repos = getRepositories();
    await repos.users.updatePreferences(userId, { reminderEnabled: false });
    await repos.checkins.create(userId, { planId: plan.id, scheduledAt: new Date(now.getTime() - 1000).toISOString(), completedAt: null,
      status: "pending", message: "How is it going?", response: null, createdBy: "agent", createdAt: now.toISOString() });
    const result = await runDueCheckinsForUser(userId, now);
    expect(result).toHaveLength(1);
    expect(result[0].outcome).toBe("clarification_requested");
    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual(["decide-rules", "evaluate-policy", "execute-action", "run-checkin"]);
    const root = spans.at(-1)!;
    expect(root.attributes["langfuse.observation.type"]).toBe("agent");
    expect(root.attributes["session.id"]).toBeUndefined();
    expect(root.attributes["langfuse.trace.tags"]).toEqual(["background-checkin"]);
    expect(spans.slice(0, -1).every((span) => span.parentSpanContext?.spanId === root.spanContext().spanId)).toBe(true);
  });
});
