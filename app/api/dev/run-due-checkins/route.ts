import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { runDueCheckinsForUser } from "@/lib/background/runDueCheckins";

/**
 * §23: local stand-in for the Cloud Scheduler → Cloud Tasks → Cloud Run
 * production path, scoped to the signed-in user so the demo can trigger
 * background evaluation on demand instead of waiting for a real schedule.
 * Runs the identical logic POST /api/cron/run-due-checkins uses in
 * production (lib/background/runDueCheckins.ts) — nothing here is faked.
 */
export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "This endpoint is only available in DEMO_MODE." }, { status: 403 });
  }
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const results = await runDueCheckinsForUser(auth.user.uid);
  return NextResponse.json({ results });
}
