import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

/** §14: full data export as a downloadable JSON file. */
export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const repos = getRepositories();
  const uid = auth.user.uid;
  const plans = await repos.plans.list(uid);
  const [user, memories, planVersions, events, agentRuns, actions, checkins, conversations] = await Promise.all([
    repos.users.getUser(uid),
    repos.memories.list(uid),
    Promise.all(plans.map((p) => repos.planVersions.listByPlan(uid, p.id))).then((v) => v.flat()),
    repos.events.list(uid, { limit: 5000 }),
    repos.agentRuns.listRecent(uid, 500),
    repos.actions.list(uid),
    repos.checkins.list(uid),
    repos.conversations.list(uid),
  ]);

  const conversationsWithMessages = await Promise.all(
    conversations.map(async (c) => ({ ...c, messages: await repos.conversations.listMessages(uid, c.id) }))
  );

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user,
      memories,
      plans,
      planVersions,
      events,
      agentRuns,
      actions,
      checkins,
      conversations: conversationsWithMessages,
    },
    null,
    2
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="continuum-export.json"',
    },
  });
}
