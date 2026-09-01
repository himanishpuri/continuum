import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { computeProgressSnapshot } from "@/lib/progress/progressEngine";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const repos = getRepositories();
  const [plan, events] = await Promise.all([
    repos.plans.getActive(auth.user.uid),
    repos.events.list(auth.user.uid, { types: ["SESSION_COMPLETED", "SESSION_MISSED"], limit: 200 }),
  ]);

  const snapshot = computeProgressSnapshot(events, plan, new Date());
  return NextResponse.json({ progress: snapshot, plan });
}
