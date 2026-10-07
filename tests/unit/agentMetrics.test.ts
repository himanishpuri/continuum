import { describe, expect, it } from "vitest";
import { computeAgentMetrics } from "@/lib/metrics/agentMetrics";
import type { AgentAction, AgentRun, CheckIn, EventRecord } from "@/lib/types";

describe("agent metrics", () => {
  it("computes per-prompt median latency and measured token average", () => {
    const runs = [
      { prompt: "a", latencyMs: 10, usage: { inputTokens: 2, outputTokens: 3 }, actions: [] },
      { prompt: "a", latencyMs: 30, usage: { inputTokens: 4, outputTokens: 6 }, actions: [] },
      { prompt: "b", latencyMs: 100, actions: [] },
    ] as unknown as AgentRun[];
    const metrics = computeAgentMetrics(runs, [], [], [], null);
    expect(metrics.byPrompt).toMatchObject([
      { prompt: "a", p50LatencyMs: 20, tokensPerTurn: 7.5 },
      { prompt: "b", p50LatencyMs: 100, tokensPerTurn: null },
    ]);
  });

  it("computes approval, run, confidence, and 14-day intervention outcomes", () => {
    const runs = [
      { latencyMs: 100, usage: { inputTokens: 20, outputTokens: 10 }, degraded: false, safetyStop: false, prompt: "agent_decision@1#aaaa0000", actions: [{ actionId: "approved" }] },
      { latencyMs: 300, usage: { inputTokens: 40, outputTokens: 10 }, degraded: true, safetyStop: true, prompt: "agent_decision@1#bbbb0000", actions: [{ actionId: "rejected" }] },
    ] as AgentRun[];
    const actions = [{ id: "approved", status: "COMPLETED", approvalRequired: true }, { id: "rejected", status: "REJECTED", approvalRequired: true }] as AgentAction[];
    const event = (id: string, type: EventRecord["type"], timestamp: string): EventRecord => ({
      id, userId: "u", type, timestamp, source: "user", payload: {}, summary: "",
    });
    const events = [
      event("before-1", "SESSION_COMPLETED", "2026-01-08T12:00:00.000Z"),
      event("before-2", "SESSION_MISSED", "2026-01-09T12:00:00.000Z"),
      event("change", "PLAN_UPDATED", "2026-01-10T12:00:00.000Z"),
      event("after-1", "SESSION_COMPLETED", "2026-01-11T12:00:00.000Z"),
      event("after-2", "SESSION_COMPLETED", "2026-01-12T12:00:00.000Z"),
    ];
    const checkins = [
      { selfReport: { confidence: 4, note: null, answeredAt: "2026-01-08T00:00:00.000Z" } },
      { selfReport: { confidence: 7, note: null, answeredAt: "2026-01-13T00:00:00.000Z" } },
    ] as CheckIn[];
    const metrics = computeAgentMetrics(runs, actions, events, checkins, null, new Date("2026-01-20T00:00:00.000Z"));
    expect(metrics).toMatchObject({ approvalRate: 0.5, rejectionRate: 0.5, degradedRate: 0.5, safetyStops: 1, p50LatencyMs: 200, tokensPerTurn: 40 });
    expect(metrics.confidenceTrend).toMatchObject({ latest: 7, change: 3 });
    expect(metrics.postInterventionAdherence[0]).toMatchObject({ beforeRate: 0.5, afterRate: 1, change: 0.5 });
    expect(metrics.byPrompt).toEqual([
      { prompt: "agent_decision@1#aaaa0000", runs: 1, safetyStops: 0, degradedRate: 0, approvalRate: 1, p50LatencyMs: 100, tokensPerTurn: 30 },
      { prompt: "agent_decision@1#bbbb0000", runs: 1, safetyStops: 1, degradedRate: 1, approvalRate: 0, p50LatencyMs: 300, tokensPerTurn: 50 },
    ]);
  });
});
