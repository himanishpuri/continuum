import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

const Body = z.object({ confidence: z.number().int().min(0).max(10), note: z.string().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid check-in reply." }, { status: 400 });
  const { id } = await params;
  const repos = getRepositories();
  const userId = auth.user.uid;
  const checkin = await repos.checkins.get(userId, id);
  if (!checkin) return NextResponse.json({ error: "Check-in not found." }, { status: 404 });
  if (checkin.status !== "completed") return NextResponse.json({ error: "This check-in is not complete yet." }, { status: 409 });
  if (checkin.selfReport) return NextResponse.json({ error: "You already replied to this check-in." }, { status: 409 });
  const now = new Date().toISOString();
  const updated = await repos.checkins.update(userId, id, {
    selfReport: { confidence: parsed.data.confidence, note: parsed.data.note ?? null, answeredAt: now },
  });
  await repos.events.create(userId, {
    type: "CHECKIN_COMPLETED", timestamp: now, source: "user",
    payload: { checkinId: id, kind: "self_report", confidence: parsed.data.confidence },
    summary: `You rated your confidence ${parsed.data.confidence}/10`,
  });
  return NextResponse.json({ checkin: updated });
}
