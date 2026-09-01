import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { buildAgentContext } from "@/src/ai/agent/context";
import { adherenceDecision } from "@/lib/agent/demoAgentProvider";
import { findEvidence } from "@/lib/evidence/evidenceEngine";
import { getRepositories } from "@/lib/repositories";

/**
 * Powers the Dashboard's "what Continuum thinks matters today" card. The
 * recommendation is computed with the same deterministic evidence engine
 * the agent itself uses — no extra Gemini call on every page load (§35).
 */
export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const repos = getRepositories();
  const [context, nextCheckins] = await Promise.all([
    buildAgentContext(auth.user.uid),
    repos.checkins.list(auth.user.uid),
  ]);

  const decision = adherenceDecision(context);
  const evidence = findEvidence(context.evidence, decision.evidenceIds);
  const nextCheckin = nextCheckins
    .filter((c) => c.status === "pending")
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1))[0] ?? null;

  return NextResponse.json({
    profile: context.user.profile,
    plan: context.plan,
    progress: context.progress,
    recommendation: {
      summary: decision.summary,
      evidence,
      proposedAction: decision.proposedAction,
    },
    nextCheckin,
  });
}
