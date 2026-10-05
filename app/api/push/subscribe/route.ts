import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { EndpointSchema, SubscriptionSchema } from "@/lib/push/subscriptionSchema";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const parsed = SubscriptionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  const repo = getRepositories().pushSubscriptions;
  const userId = auth.user.uid;
  const existing = await repo.findByEndpoint(userId, parsed.data.endpoint);
  if (!existing && (await repo.list(userId)).length >= 10) {
    return NextResponse.json({ error: "Maximum of 10 devices reached." }, { status: 409 });
  }
  const data = { keys: parsed.data.keys, userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "" };
  const subscription = existing
    ? await repo.update(userId, existing.id, data)
    : await repo.create(userId, { endpoint: parsed.data.endpoint, ...data, createdAt: new Date().toISOString() });
  return NextResponse.json({ id: subscription.id });
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const parsed = z.object({ endpoint: EndpointSchema }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid endpoint." }, { status: 400 });
  await getRepositories().pushSubscriptions.deleteByEndpoint(auth.user.uid, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
