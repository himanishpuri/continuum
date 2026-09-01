import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { buildAgentContext } from "@/src/ai/agent/context";
import { adherenceDecision } from "@/lib/agent/demoAgentProvider";
import { proposeAction, approveAction } from "@/lib/tools/actionService";
import { scheduleFollowupCheckin } from "@/lib/agent/followup";

/**
 * "Apply recommendation" on the Dashboard (§7). The recommendation is
 * recomputed server-side from current data rather than trusting whatever
 * the client last rendered, then proposed and approved in one step since
 * clicking Apply is itself the user's explicit consent — it still goes
 * through the same policy-gated proposeAction/approveAction pipeline and
 * leaves the same plan-version and audit trail a chat approval would.
 */
export async function POST() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const context = await buildAgentContext(auth.user.uid);
  const decision = adherenceDecision(context);
  if (!decision.proposedAction) {
    return NextResponse.json({ error: "There's no pending recommendation to apply right now." }, { status: 400 });
  }

  const outcome = await proposeAction(auth.user.uid, {
    proposal: decision.proposedAction,
    evidenceIds: decision.evidenceIds,
    permissions: context.user.settings.permissions,
    autonomyLevel: context.user.settings.autonomyLevel,
  });

  if (!outcome.allowed || !outcome.action) {
    return NextResponse.json({ error: outcome.reason }, { status: 403 });
  }

  let action = outcome.action;
  if (action.status === "PENDING_APPROVAL") {
    action = await approveAction(auth.user.uid, action.id);
  }

  const followupCheckinId = await scheduleFollowupCheckin(auth.user.uid, action);
  return NextResponse.json({ action, followupCheckinId });
}
