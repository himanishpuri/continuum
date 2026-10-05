import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { checkRateLimit } from "@/lib/util/rateLimit";
import { getNotificationService } from "@/lib/external/notificationService";

export async function POST() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const limit = checkRateLimit(`push-test:${auth.user.uid}`, 3, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many test notifications." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const result = await getNotificationService().send({
    userId: auth.user.uid, channel: "push", title: "Continuum test",
    message: "Notifications are working on this device.", url: "/dashboard",
  });
  return NextResponse.json(result);
}
