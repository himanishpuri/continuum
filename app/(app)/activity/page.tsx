"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Card } from "@/components/ui/Card";
import { ActivityItem } from "@/components/activity/ActivityItem";
import type { EventRecord } from "@/lib/types";
import type { AgentMetrics } from "@/lib/metrics/agentMetrics";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sessions", label: "Sessions" },
  { key: "plans", label: "Plans" },
  { key: "agent", label: "Agent" },
] as const;

function matchesFilter(event: EventRecord, filter: (typeof FILTERS)[number]["key"]): boolean {
  if (filter === "all") return true;
  if (filter === "sessions") return event.type === "SESSION_COMPLETED" || event.type === "SESSION_MISSED";
  if (filter === "plans") return event.type.startsWith("PLAN_") || event.type.startsWith("CHECKIN_") || event.type.startsWith("ACTION_");
  return event.type.startsWith("AGENT_") || event.type.startsWith("MEMORY_") || event.type === "MESSAGE_SENT";
}

export default function ActivityPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["activity"],
    queryFn: () => api.get<{ events: EventRecord[] }>("/api/activity?limit=100"),
  });
  const metricsQuery = useQuery({ queryKey: ["agent-metrics"], queryFn: () => api.get<{ metrics: AgentMetrics }>("/api/agent/metrics") });

  if (isLoading) return <LoadingState label="Loading activity…" />;
  if (isError || !data) return <ErrorState message="Couldn't load activity." onRetry={() => refetch()} />;

  const events = data.events.filter((e) => matchesFilter(e, filter));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Activity</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every meaningful thing Continuum has done, in order.</p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent insights</h2>
        {metricsQuery.isLoading && <p className="mt-2 text-sm text-slate-500">Loading insights…</p>}
        {metricsQuery.isError && <p className="mt-2 text-sm text-rose-600">Couldn&apos;t load insights.</p>}
        {metricsQuery.data && <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
          <p>Approvals: {formatRate(metricsQuery.data.metrics.approvalRate)} · Rejections: {formatRate(metricsQuery.data.metrics.rejectionRate)}</p>
          <p>Degraded turns: {formatRate(metricsQuery.data.metrics.degradedRate)}</p>
          <p>Safety stops: {metricsQuery.data.metrics.safetyStops}</p>
          <p>Median latency: {metricsQuery.data.metrics.p50LatencyMs === null ? "No data" : `${Math.round(metricsQuery.data.metrics.p50LatencyMs)} ms`}</p>
          <p>Tokens per measured turn: {metricsQuery.data.metrics.tokensPerTurn === null ? "No data" : Math.round(metricsQuery.data.metrics.tokensPerTurn)}</p>
          <p>Latest confidence: {metricsQuery.data.metrics.confidenceTrend.latest === null ? "No rating" : `${metricsQuery.data.metrics.confidenceTrend.latest}/10`}</p>
          {metricsQuery.data.metrics.postInterventionAdherence.length > 0 && <p className="sm:col-span-2 lg:col-span-3">
            {metricsQuery.data.metrics.postInterventionAdherence.at(-1)!.beforeRate === null && metricsQuery.data.metrics.postInterventionAdherence.at(-1)!.afterRate === null
              ? "Last plan change: not enough session history yet (needs logged sessions in the 14 days before and after)."
              : <>Last plan change, 14-day completion: {formatRate(metricsQuery.data.metrics.postInterventionAdherence.at(-1)!.beforeRate)} before → {formatRate(metricsQuery.data.metrics.postInterventionAdherence.at(-1)!.afterRate)} after</>}
          </p>}
        </div>}
        {metricsQuery.data && metricsQuery.data.metrics.byPrompt.length > 0 && <div className="mt-4 overflow-x-auto text-sm text-slate-600 dark:text-slate-400">
          <h3 className="mb-2 font-medium text-slate-900 dark:text-slate-100">By prompt version</h3>
          <table className="w-full text-left">
            <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-1 pr-3">Prompt</th><th className="py-1 pr-3">Runs</th><th className="py-1 pr-3">Safety stops</th><th className="py-1 pr-3">Degraded</th><th className="py-1 pr-3">Latency</th><th className="py-1 pr-3">Tokens</th><th className="py-1">Approvals</th></tr></thead>
            <tbody>{metricsQuery.data.metrics.byPrompt.map((item) => <tr key={item.prompt} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1 pr-3 font-mono text-xs">{item.prompt}</td><td className="py-1 pr-3">{item.runs}</td><td className="py-1 pr-3">{item.safetyStops}</td><td className="py-1 pr-3">{formatRate(item.degradedRate)}</td><td className="py-1 pr-3">{item.p50LatencyMs === null ? "—" : `${item.p50LatencyMs} ms`}</td><td className="py-1 pr-3">{item.tokensPerTurn ?? "—"}</td><td className="py-1">{formatRate(item.approvalRate)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Card>

      <div className="flex gap-2" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-teal-700 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState title="Nothing here yet" description="Once Continuum starts reasoning, planning, and acting on your behalf, it will show up here." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((e) => (
              <ActivityItem key={e.id} event={e} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function formatRate(value: number | null): string {
  return value === null ? "No data" : `${Math.round(value * 100)}%`;
}
