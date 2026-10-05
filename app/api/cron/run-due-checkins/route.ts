import { NextResponse } from "next/server";
import { runDueCheckinsForAllUsers } from "@/lib/background/runDueCheckins";
import { timingSafeEqualStr } from "@/lib/util/timingSafeEqual";

/**
 * §23: Vercel Cron calls GET with `Authorization: Bearer <CRON_SECRET>`
 * (auto-injected when CRON_SECRET is set on the project). The shared secret
 * authorizes this job without a browser session.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization") ?? "";
  return timingSafeEqualStr(bearer, `Bearer ${expected}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const results = await runDueCheckinsForAllUsers();
  return NextResponse.json({ results, count: results.length });
}
