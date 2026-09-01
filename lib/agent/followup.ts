import { getRepositories } from "@/lib/repositories";
import { proposeAction } from "@/lib/tools/actionService";
import type { AgentAction, Plan } from "@/lib/types";

function computeCheckinDate(plan: Plan, sessionsAhead: number): Date {
  let count = 0;
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  while (count < sessionsAhead) {
    if (plan.schedule.daysOfWeek.includes(cursor.getDay())) count += 1;
    if (count < sessionsAhead) cursor.setDate(cursor.getDate() + 1);
  }
  const [h, m] = plan.schedule.time.split(":").map(Number);
  cursor.setHours(h, m, 0, 0);
  return cursor;
}

/**
 * §1/§28: once a plan change is approved and executed, Continuum
 * automatically schedules a follow-up check-in a couple of sessions out
 * ("I'll check in after your next two sessions"). Scheduling a check-in is
 * always low-risk / no-approval under policy, so this runs immediately —
 * no separate user action needed.
 */
export async function scheduleFollowupCheckin(userId: string, action: AgentAction): Promise<string | null> {
  if (action.status !== "COMPLETED") return null;
  if (action.type !== "MODIFY_PLAN" && action.type !== "CREATE_PLAN") return null;

  const planId = (action.result as { planId?: string } | null)?.planId;
  if (!planId) return null;

  const repos = getRepositories();
  const [plan, user] = await Promise.all([repos.plans.get(userId, planId), repos.users.getUser(userId)]);
  if (!plan || !user) return null;

  const scheduledAt = computeCheckinDate(plan, 2).toISOString();
  const outcome = await proposeAction(userId, {
    proposal: {
      actionType: "SCHEDULE_CHECKIN",
      parameters: {
        scheduledAt,
        message: "How did your last two sessions go with the updated plan?",
        planId: plan.id,
      },
      reason: "Automatic follow-up after a plan change.",
      riskLevel: "low",
      requiresApproval: false,
    },
    evidenceIds: [],
    permissions: user.settings.permissions,
    autonomyLevel: user.settings.autonomyLevel,
  });

  const result = outcome.action?.result as { checkinId?: string } | null;
  return result?.checkinId ?? null;
}
