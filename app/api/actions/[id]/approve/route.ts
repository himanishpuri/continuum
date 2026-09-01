import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { approveAction } from "@/lib/tools/actionService";
import { scheduleFollowupCheckin } from "@/lib/agent/followup";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const action = await approveAction(auth.user.uid, id);
    const followupCheckinId = await scheduleFollowupCheckin(auth.user.uid, action);
    return NextResponse.json({ action, followupCheckinId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not approve this action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
