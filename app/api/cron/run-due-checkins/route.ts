import { NextResponse } from "next/server";
import { runDueCheckinsForAllUsers } from "@/lib/background/runDueCheckins";
import { timingSafeEqualStr } from "@/lib/util/timingSafeEqual";

/**
 * §23: the production target for a scheduled background job. Authorized by
 * a shared secret rather than a user session, since the scheduler calls it
 * directly with no browser session involved.
 *
 * Two callers, two conventions:
 *  - Vercel Cron sends `GET` with `Authorization: Bearer <CRON_SECRET>`
 *    (auto-injected when the CRON_SECRET env var is set on the project).
 *  - Cloud Scheduler (scripts/setup-cloud-scheduler.sh) sends `POST` with
 *    an `X-Cron-Secret` header.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("x-cron-secret") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  return timingSafeEqualStr(header, expected) || timingSafeEqualStr(bearer, `Bearer ${expected}`);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const results = await runDueCheckinsForAllUsers();
  return NextResponse.json({ results, count: results.length });
}

export const GET = handle;
export const POST = handle;
