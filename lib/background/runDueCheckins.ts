import { getRepositories } from "@/lib/repositories";
import { computeProgressSnapshot } from "@/lib/progress/progressEngine";
import { buildEvidence } from "@/lib/evidence/evidenceEngine";
import { proposeAction } from "@/lib/tools/actionService";
import type { CheckIn, Plan, ProgressSnapshot, UserRecord } from "@/lib/types";

export interface CheckinRunResult {
  userId: string;
  checkinId: string;
  outcome: "no_action_needed" | "plan_change_proposed" | "clarification_requested";
  message: string;
}

/**
 * §23: the production entry point is Cloud Scheduler → Cloud Run hitting
 * POST /api/cron/run-due-checkins, which calls this for every user. Locally,
 * POST /api/dev/run-due-checkins calls the same function directly so the
 * demo can simulate background execution without any scheduler infra.
 */
export async function runDueCheckinsForAllUsers(now: Date = new Date()): Promise<CheckinRunResult[]> {
  const repos = getRepositories();
  const userIds = await repos.listUserIds();
  const results: CheckinRunResult[] = [];
  for (const userId of userIds) {
    results.push(...(await runDueCheckinsForUser(userId, now)));
  }
  return results;
}

export async function runDueCheckinsForUser(userId: string, now: Date = new Date()): Promise<CheckinRunResult[]> {
  const repos = getRepositories();
  const due = await repos.checkins.listDue(userId, now.toISOString());
  if (due.length === 0) return [];

  const [plan, user, events] = await Promise.all([
    repos.plans.getActive(userId),
    repos.users.getUser(userId),
    repos.events.list(userId, { types: ["SESSION_COMPLETED", "SESSION_MISSED"], limit: 200 }),
  ]);
  if (!user) return [];

  const progress = computeProgressSnapshot(events, plan, now);
  const evidenceIds = buildEvidence(progress, plan, user.preferences, now).map((e) => e.id);

  const results: CheckinRunResult[] = [];
  for (const checkin of due) {
    results.push(await evaluateCheckin(userId, checkin, plan, progress, evidenceIds, user));
  }
  return results;
}

/**
 * §24: reasons about severity instead of reacting to any single missed
 * session — one miss out of five is not the same signal as one completion
 * out of five.
 */
async function evaluateCheckin(
  userId: string,
  checkin: CheckIn,
  plan: Plan | null,
  progress: ProgressSnapshot,
  evidenceIds: string[],
  user: UserRecord
): Promise<CheckinRunResult> {
  const repos = getRepositories();
  const now = new Date();

  // Severity is adherence vs. the schedule (completed / scheduled plan-days),
  // not the display rate (completed / logged), so this stays stable.
  const weeklyAdherence = progress.weeklyPlanned > 0 ? progress.weeklyCompleted / progress.weeklyPlanned : 1;
  const severelyOff = Boolean(plan) && progress.weeklyPlanned >= 3 && weeklyAdherence < 0.4;
  const mildDip = Boolean(plan) && !severelyOff && weeklyAdherence < 0.7;

  let message: string;
  let outcome: CheckinRunResult["outcome"];
  const steps = ["Found a due check-in", "Reviewed recent progress"];

  if (severelyOff && plan) {
    outcome = "clarification_requested";
    message = `You've completed ${progress.weeklyCompleted} of your last ${progress.weeklyPlanned} planned sessions. Is your current schedule (${plan.durationMinutes} min, ${plan.frequencyLabel}) still realistic? I can shorten it or move it to a different time if that would help.`;
    steps.push("Adherence has dropped significantly — following up again soon");
    await proposeAction(userId, {
      proposal: {
        actionType: "SCHEDULE_CHECKIN",
        parameters: {
          scheduledAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString(),
          message: "Following up on whether your schedule still feels realistic.",
          planId: plan.id,
        },
        reason: "Adherence has fallen significantly; following up again soon.",
        riskLevel: "low",
        requiresApproval: false,
      },
      evidenceIds,
      permissions: user.settings.permissions,
      autonomyLevel: user.settings.autonomyLevel,
    });
  } else if (mildDip) {
    outcome = "no_action_needed";
    message = `You've done ${progress.weeklyCompleted} of ${progress.weeklyPlanned} scheduled sessions this week. A little behind, but nothing that needs a plan change — keep going.`;
    steps.push("Adherence dipped slightly but remains within a normal range");
  } else {
    outcome = "no_action_needed";
    message = plan
      ? `You've done ${progress.weeklyCompleted} of ${progress.weeklyPlanned} scheduled sessions this week. Adherence looks strong — no changes needed.`
      : "No active plan to check in on yet.";
    steps.push("Adherence remains strong");
  }

  const completedCheckin = await repos.checkins.update(userId, checkin.id, {
    status: "completed",
    completedAt: now.toISOString(),
    response: message,
  });

  await repos.events.create(userId, {
    type: "CHECKIN_COMPLETED",
    timestamp: now.toISOString(),
    source: "background",
    payload: { checkinId: completedCheckin.id, outcome },
    summary: outcome === "no_action_needed" ? "Agent checked progress — no intervention needed." : "Agent detected an adherence issue during a scheduled check-in.",
  });

  await repos.agentRuns.create(userId, {
    conversationId: "background",
    trigger: "background_checkin",
    input: checkin.message,
    status: "completed",
    provider: "demo",
    steps: steps.map((label) => ({ label, completedAt: now.toISOString() })),
    planSummary: null,
    actions: [],
    resultSummary: message,
    error: null,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
  });

  return { userId, checkinId: completedCheckin.id, outcome, message };
}
