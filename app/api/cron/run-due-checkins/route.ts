import { NextResponse } from "next/server";
import { runDueCheckinsForAllUsers } from "@/lib/background/runDueCheckins";

/**
 * §23: the production target for a Cloud Scheduler HTTP job. Authorized by
 * a shared secret header rather than a user session, since Scheduler calls
 * it directly with no browser session involved.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await runDueCheckinsForAllUsers();
  return NextResponse.json({ results, count: results.length });
}
