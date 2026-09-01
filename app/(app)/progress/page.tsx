"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DurationBarChart } from "@/components/progress/DurationBarChart";
import { DayTimeline } from "@/components/progress/DayTimeline";
import type { Plan, ProgressSnapshot } from "@/lib/types";

const TREND_TONE = { improving: "success", declining: "danger", stable: "neutral" } as const;

export default function ProgressPage() {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState<"completed" | "missed" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["progress"],
    queryFn: () => api.get<{ progress: ProgressSnapshot; plan: Plan | null }>("/api/progress"),
  });

  async function logToday(status: "completed" | "missed") {
    if (!data?.plan) return;
    setLogging(status);
    try {
      await api.post("/api/events", {
        type: status === "completed" ? "SESSION_COMPLETED" : "SESSION_MISSED",
        durationMinutes: data.plan.durationMinutes,
      });
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } finally {
      setLogging(null);
    }
  }

  if (isLoading) return <LoadingState label="Loading your progress…" />;
  if (isError || !data) return <ErrorState message="Couldn't load your progress." onRetry={() => refetch()} />;

  const { progress, plan } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Progress</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Deterministic statistics from your recorded sessions — not model guesses.</p>
        </div>
        {plan && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => logToday("completed")} disabled={logging !== null}>
              {logging === "completed" ? "Logging…" : "Log today: completed"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => logToday("missed")} disabled={logging !== null}>
              {logging === "missed" ? "Logging…" : "Log today: missed"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">This week</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {progress.weeklyCompleted}/{progress.weeklyPlanned}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{Math.round(progress.weeklyCompletionRate * 100)}% completion</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Streak</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{progress.streakDays}d</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Avg. duration</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{progress.averageDurationMinutes} min</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Trend</p>
          <div className="mt-2">
            <Badge tone={TREND_TONE[progress.trend]}>{progress.trend}</Badge>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completion by session duration</CardTitle>
        </CardHeader>
        <DurationBarChart buckets={progress.completionByDuration} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 7 days</CardTitle>
        </CardHeader>
        <DayTimeline days={progress.timeline} />
      </Card>
    </div>
  );
}
