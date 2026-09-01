"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import { PlanCard, formatTime } from "@/components/plans/PlanCard";
import { Button } from "@/components/ui/Button";
import type { CheckIn, Evidence, Plan, ProgressSnapshot, UserProfile } from "@/lib/types";
import type { ActionProposal } from "@/src/ai/schemas/actionSchemas";

interface DashboardResponse {
  profile: UserProfile;
  plan: Plan | null;
  progress: ProgressSnapshot;
  recommendation: { summary: string; evidence: Evidence[]; proposedAction: ActionProposal | null };
  nextCheckin: CheckIn | null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardResponse>("/api/dashboard"),
  });

  async function applyRecommendation() {
    setApplying(true);
    try {
      await api.post("/api/dashboard/apply-recommendation");
      setApplied(true);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      // surfaced implicitly via refetch failing state; keep it simple for a dashboard shortcut
    } finally {
      setApplying(false);
    }
  }

  if (isLoading) return <LoadingState label="Loading your dashboard…" />;
  if (isError || !data) return <ErrorState message="Couldn't load your dashboard." onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {greeting()}, {data.profile.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here&apos;s what Continuum thinks matters today.</p>
      </div>

      {data.plan ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PlanCard plan={data.plan} compact />
          <StatCard label="Current streak" value={`${data.progress.streakDays} day${data.progress.streakDays === 1 ? "" : "s"}`} />
          <StatCard label="Weekly completion" value={`${Math.round(data.progress.weeklyCompletionRate * 100)}%`} hint={`${data.progress.weeklyCompleted} of ${data.progress.weeklyPlanned} sessions`} />
          <StatCard
            label="Next check-in"
            value={data.nextCheckin ? new Date(data.nextCheckin.scheduledAt).toLocaleDateString(undefined, { weekday: "long" }) : "None scheduled"}
            hint={data.nextCheckin ? formatTime(new Date(data.nextCheckin.scheduledAt).toTimeString().slice(0, 5)) : undefined}
          />
        </div>
      ) : (
        <EmptyState
          title="No active plan yet"
          description="Tell Continuum about a routine you'd like help with in the Agent tab, and it will propose a plan grounded in your preferences."
          action={
            <Link href="/agent">
              <Button size="sm" className="mt-2">
                Talk to Continuum
              </Button>
            </Link>
          }
        />
      )}

      <RecommendationCard
        summary={data.recommendation.summary}
        evidence={data.recommendation.evidence}
        proposedAction={data.recommendation.proposedAction}
        onApply={applyRecommendation}
        applying={applying}
        applied={applied}
      />
    </div>
  );
}
