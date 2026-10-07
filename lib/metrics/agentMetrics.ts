import { computeProgressSnapshot } from "@/lib/progress/progressEngine";
import type { AgentAction, AgentRun, CheckIn, EventRecord, Plan } from "@/lib/types";

export interface AgentMetrics {
  approvalRate: number | null;
  rejectionRate: number | null;
  degradedRate: number | null;
  safetyStops: number;
  p50LatencyMs: number | null;
  tokensPerTurn: number | null;
  confidenceTrend: { latest: number | null; change: number | null; ratings: number[] };
  postInterventionAdherence: { eventId: string; beforeRate: number | null; afterRate: number | null; change: number | null }[];
  byPrompt: { prompt: string; runs: number; safetyStops: number; degradedRate: number | null; approvalRate: number | null }[];
}

function rate(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

/** §58: per-user, deterministic metrics from persisted runs and events. */
export function computeAgentMetrics(
  runs: AgentRun[], actions: AgentAction[], events: EventRecord[], checkins: CheckIn[], plan: Plan | null,
  now: Date = new Date()
): AgentMetrics {
  const decided = actions.filter((action) => action.approvalRequired && ["APPROVED", "COMPLETED", "EXECUTING", "REJECTED"].includes(action.status));
  const approved = decided.filter((action) => action.status !== "REJECTED").length;
  const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  const p50LatencyMs = latencies.length === 0 ? null : latencies.length % 2 ? latencies[middle] : (latencies[middle - 1] + latencies[middle]) / 2;
  const measured = runs.filter((run) => run.usage);
  const ratings = checkins.flatMap((checkin) => checkin.selfReport ? [checkin.selfReport] : [])
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt)).map((report) => report.confidence);
  const sessionEvents = events.filter((event) => event.type === "SESSION_COMPLETED" || event.type === "SESSION_MISSED");
  const interventions = events.filter((event) => event.type === "PLAN_UPDATED").map((event) => {
    const at = new Date(event.timestamp).getTime();
    const before = sessionEvents.filter((session) => {
      const time = new Date(session.timestamp).getTime();
      return time >= at - 14 * 86_400_000 && time < at;
    });
    const afterEnd = Math.min(at + 14 * 86_400_000, now.getTime());
    const after = sessionEvents.filter((session) => {
      const time = new Date(session.timestamp).getTime();
      return time >= at && time < afterEnd;
    });
    const beforeRate = before.length ? computeProgressSnapshot(before, plan, new Date(at - 1)).completionRate : null;
    const afterRate = after.length ? computeProgressSnapshot(after, plan, new Date(afterEnd)).completionRate : null;
    return { eventId: event.id, beforeRate, afterRate, change: beforeRate === null || afterRate === null ? null : afterRate - beforeRate };
  });
  const promptRuns = new Map<string, AgentRun[]>();
  for (const run of runs) {
    if (!run.prompt) continue;
    const group = promptRuns.get(run.prompt) ?? [];
    group.push(run);
    promptRuns.set(run.prompt, group);
  }
  const byPrompt = [...promptRuns].map(([prompt, group]) => {
    const actionIds = new Set(group.flatMap((run) => run.actions.map((action) => action.actionId)));
    const promptDecided = decided.filter((action) => actionIds.has(action.id));
    return {
      prompt,
      runs: group.length,
      safetyStops: group.filter((run) => run.safetyStop).length,
      degradedRate: rate(group.filter((run) => run.degraded).length, group.length),
      approvalRate: rate(promptDecided.filter((action) => action.status !== "REJECTED").length, promptDecided.length),
    };
  }).sort((a, b) => b.runs - a.runs || a.prompt.localeCompare(b.prompt));
  return {
    approvalRate: rate(approved, decided.length),
    rejectionRate: rate(decided.length - approved, decided.length),
    degradedRate: rate(runs.filter((run) => run.degraded).length, runs.length),
    safetyStops: runs.filter((run) => run.safetyStop).length,
    p50LatencyMs,
    tokensPerTurn: measured.length ? measured.reduce((total, run) => total + (run.usage!.inputTokens + run.usage!.outputTokens), 0) / measured.length : null,
    confidenceTrend: { latest: ratings.at(-1) ?? null, change: ratings.length > 1 ? ratings.at(-1)! - ratings[0] : null, ratings },
    postInterventionAdherence: interventions,
    byPrompt,
  };
}
