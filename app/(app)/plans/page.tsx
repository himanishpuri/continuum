"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PlanCard } from "@/components/plans/PlanCard";
import { PlanVersionTimeline } from "@/components/plans/PlanVersionTimeline";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { Plan, PlanVersion } from "@/lib/types";

export default function PlansPage() {
  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: () => api.get<{ plans: Plan[] }>("/api/plans") });
  const activePlan = plansQuery.data?.plans[0];

  const versionsQuery = useQuery({
    queryKey: ["plan-versions", activePlan?.id],
    queryFn: () => api.get<{ plan: Plan; versions: PlanVersion[] }>(`/api/plans/${activePlan!.id}`),
    enabled: Boolean(activePlan),
  });

  if (plansQuery.isLoading) return <LoadingState label="Loading your plans…" />;
  if (plansQuery.isError) return <ErrorState message="Couldn't load your plans." onRetry={() => plansQuery.refetch()} />;

  if (!activePlan) {
    return (
      <EmptyState
        title="No plans yet"
        description="Once you tell Continuum about a routine you'd like help with, a plan will appear here — along with its full version history as it evolves."
        action={
          <Link href="/agent">
            <Button size="sm" className="mt-2">
              Talk to Continuum
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Plans</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your active routine and how it has evolved over time.</p>
      </div>

      <PlanCard plan={activePlan} />

      <Card>
        <CardHeader>
          <CardTitle>Success metrics</CardTitle>
        </CardHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          {activePlan.successMetrics.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        {versionsQuery.isLoading && <LoadingState label="Loading history…" />}
        {versionsQuery.data && <PlanVersionTimeline versions={versionsQuery.data.versions} />}
      </Card>
    </div>
  );
}
