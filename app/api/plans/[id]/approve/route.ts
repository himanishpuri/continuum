import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { approveAction } from "@/lib/tools/actionService";
import { scheduleFollowupCheckin } from "@/lib/agent/followup";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const pending = await getRepositories().actions.listByStatus(auth.user.uid, ["PENDING_APPROVAL"]);
  const match = pending.find(
    (a) => (a.type === "MODIFY_PLAN" || a.type === "CREATE_PLAN") && (a.parameters as { planId?: string }).planId === id
  );
  if (!match) return NextResponse.json({ error: "No pending change found for this plan." }, { status: 404 });

  try {
    const action = await approveAction(auth.user.uid, match.id);
    const followupCheckinId = await scheduleFollowupCheckin(auth.user.uid, action);
    return NextResponse.json({ action, followupCheckinId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not approve this change.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
