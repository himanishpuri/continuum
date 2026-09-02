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
    console.error("Approve action failed", err);
    return NextResponse.json({ error: "Could not approve this — it may have expired or already been handled. Refresh to see the current state." }, { status: 400 });
  }
}
