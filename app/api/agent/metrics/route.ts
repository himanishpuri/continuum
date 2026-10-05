import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { computeAgentMetrics } from "@/lib/metrics/agentMetrics";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const repos = getRepositories();
  const userId = auth.user.uid;
  const [runs, actions, events, checkins, plan] = await Promise.all([
    repos.agentRuns.list(userId), repos.actions.list(userId), repos.events.list(userId),
    repos.checkins.list(userId), repos.plans.getActive(userId),
  ]);
  return NextResponse.json({ metrics: computeAgentMetrics(runs, actions, events, checkins, plan) });
}
