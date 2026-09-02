import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { rejectAction } from "@/lib/tools/actionService";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const action = await rejectAction(auth.user.uid, id);
    return NextResponse.json({ action });
  } catch (err) {
    console.error("Reject action failed", err);
    return NextResponse.json({ error: "Could not reject this action." }, { status: 400 });
  }
}
