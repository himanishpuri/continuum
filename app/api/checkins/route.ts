import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const checkins = await getRepositories().checkins.list(auth.user.uid);
  return NextResponse.json({ checkins: checkins.sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1)) });
}

const BodySchema = z.object({
  scheduledAt: z.string(),
  message: z.string().min(1),
  planId: z.string().nullable().optional(),
});

/** Manually scheduling a check-in from Settings/Plans, outside the agent flow. */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const repos = getRepositories();
  const checkin = await repos.checkins.create(auth.user.uid, {
    planId: parsed.data.planId ?? null,
    scheduledAt: parsed.data.scheduledAt,
    completedAt: null,
    status: "pending",
    message: parsed.data.message,
    response: null,
    createdBy: "user",
    createdAt: new Date().toISOString(),
  });
  await repos.events.create(auth.user.uid, {
    type: "CHECKIN_SCHEDULED",
    timestamp: new Date().toISOString(),
    source: "user",
    payload: { checkinId: checkin.id },
    summary: `Scheduled a check-in for ${checkin.scheduledAt}.`,
  });

  return NextResponse.json({ checkin });
}
