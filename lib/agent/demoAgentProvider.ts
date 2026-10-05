import type { AgentDecision } from "@/src/ai/schemas/agentSchemas";
import type { AgentContext } from "@/src/ai/agent/context";
import type { CommunicationStyle } from "@/lib/types";
import type { AgentProvider, AgentTurnInput, AgentTurnResult } from "./agentProvider";

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function phrase(style: CommunicationStyle, text: Record<CommunicationStyle, string>): string {
  return text[style];
}

function simpleQueryDecision(context: AgentContext): AgentDecision {
  const { plan } = context;
  const summary = plan
    ? phrase(context.user.preferences.communicationStyle, {
        concise: `Your next session is ${plan.durationMinutes} minutes, ${plan.frequencyLabel} at ${formatTime(plan.schedule.time)}. Your streak is ${context.progress.streakDays} days.`,
        supportive: `You're keeping track of your routine. Your next session is ${plan.durationMinutes} minutes, ${plan.frequencyLabel} at ${formatTime(plan.schedule.time)}, and your streak is ${context.progress.streakDays} days.`,
        direct: `Next: ${plan.durationMinutes} minutes, ${plan.frequencyLabel} at ${formatTime(plan.schedule.time)}. Your streak is ${context.progress.streakDays} days.`,
      })
    : phrase(context.user.preferences.communicationStyle, {
        concise: "You don't have an active plan yet. What routine would you like to build?",
        supportive: "It makes sense to start with a routine that fits your life. What would you like help building?",
        direct: "Let's start with a routine that fits your week. What goal should it support?",
      });
  return {
    intent: "simple_query",
    confidence: 0.95,
    summary,
    evidenceIds: plan ? ["current_plan_duration", "streak"] : [],
    nextStep: "None needed.",
    safetyConcern: "none",
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion: null,
    memoryCandidates: [],
  };
}

function clarifyingDecision(question: string): AgentDecision {
  return {
    intent: "unclear",
    confidence: 0.3,
    summary: "I want to make sure I understand before suggesting anything.",
    evidenceIds: [],
    nextStep: "Ask a clarifying question.",
    safetyConcern: "none",
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion: question,
    memoryCandidates: [],
  };
}

function generalDecision(context: AgentContext): AgentDecision {
  return {
    intent: "general_request",
    confidence: 0.5,
    summary: phrase(context.user.preferences.communicationStyle, {
      concise: "I can help with a routine or schedule.",
      supportive: "You're taking time to think about your wellbeing. I can help with a routine or schedule.",
      direct: "Let's work on one routine or schedule issue.",
    }),
    evidenceIds: [],
    nextStep: "Await further detail from the user.",
    safetyConcern: "none",
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion: "What would you like help with — your routine, schedule, or something else?",
    memoryCandidates: [],
  };
}

/**
 * The core §1/§49 scenario, reproduced deterministically: compares
 * historical completion rates across session durations and, when one
 * meaningfully outperforms the current plan, proposes shortening (or
 * lengthening) sessions to match it.
 */
export function adherenceDecision(context: AgentContext): AgentDecision {
  const { progress, plan, user, evidence } = context;
  const checkinPending = context.pendingCheckins.length > 0;
  const evidenceIds = evidence
    .map((e) => e.id)
    .filter((id) => id.startsWith("completion_") || ["preferred_time", "streak", "trend", "weekly_completion"].includes(id));

  if (!plan) {
    return {
      intent: "improve_adherence",
      confidence: 0.6,
      summary: phrase(user.preferences.communicationStyle, {
        concise: "There's no active plan to compare yet.",
        supportive: "Starting from your own goal makes sense; there's no active plan to compare yet.",
        direct: "Let's set a starting routine before comparing progress.",
      }),
      evidenceIds: [],
      nextStep: "Propose an initial plan once the user describes their goal.",
      safetyConcern: "none",
      proposedAction: null,
      requiresApproval: false,
      clarifyingQuestion: "What routine or goal would you like help staying consistent with?",
      memoryCandidates: [],
    };
  }

  const buckets = progress.completionByDuration.filter((b) => b.sampleSize >= 2);
  const currentBucket = buckets.find((b) => b.durationMinutes === plan.durationMinutes);
  const best = [...buckets].sort((a, b) => b.completionRate - a.completionRate)[0];

  const alreadyOptimal = Boolean(best && currentBucket && best.durationMinutes === currentBucket.durationMinutes);
  const gap = best ? best.completionRate - (currentBucket?.completionRate ?? 0) : 0;
  // §49: confidence 0–4 makes a smaller step worth proposing for a borderline 5-point gap.
  const lowConfidenceBias = (context.latestSelfReport?.confidence ?? 10) <= 4 && Boolean(best && best.durationMinutes < plan.durationMinutes);
  const meaningfulGap = Boolean(best) && (gap >= 0.15 || (lowConfidenceBias && gap >= 0.05));

  if (alreadyOptimal && currentBucket) {
    return {
      intent: "improve_adherence",
      confidence: 0.75,
      summary: phrase(user.preferences.communicationStyle, {
        concise: `Your ${currentBucket.durationMinutes}-minute sessions have your best completion rate (${pct(currentBucket.completionRate)}). Would you like to keep this plan and check in next week?`,
        supportive: `You've found a session length that works: ${currentBucket.durationMinutes} minutes has your best completion rate (${pct(currentBucket.completionRate)}). Would it be okay to keep this plan and check in next week?`,
        direct: `Keep the ${currentBucket.durationMinutes}-minute plan; it has your best completion rate (${pct(currentBucket.completionRate)}). May I schedule a check-in next week?`,
      }),
      evidenceIds,
      nextStep: checkinPending ? "Keep the current plan; a check-in is already scheduled." : "Keep the current plan; schedule a confirmation check-in.",
      safetyConcern: "none",
      proposedAction: checkinPending
        ? null
        : {
            actionType: "SCHEDULE_CHECKIN",
            parameters: {
              scheduledAt: addDaysIso(7),
              message: "Checking in to see how the plan is going.",
              planId: plan.id,
            },
            reason: "Current plan already matches the best-performing session length.",
            riskLevel: "low",
            requiresApproval: false,
          },
      requiresApproval: false,
      clarifyingQuestion: null,
      memoryCandidates: [],
    };
  }

  if (!best || !meaningfulGap) {
    return {
      intent: "improve_adherence",
      confidence: 0.55,
      summary: phrase(user.preferences.communicationStyle, {
        concise: `Your completion rate is ${pct(progress.completionRate)}, without a clear session-length pattern yet. May I check in after a few more sessions?`,
        supportive: `You've kept showing up; your completion rate is ${pct(progress.completionRate)}, but session length isn't a clear factor yet. Would it be okay to check in after a few more sessions?`,
        direct: `Keep the plan while we gather more data; completion is ${pct(progress.completionRate)}. May I schedule a check-in in a few days?`,
      }),
      evidenceIds,
      nextStep: checkinPending ? "Wait for more session data; a check-in is already scheduled." : "Schedule a check-in to gather more data before recommending a change.",
      safetyConcern: "none",
      proposedAction: checkinPending
        ? null
        : {
            actionType: "SCHEDULE_CHECKIN",
            parameters: {
              scheduledAt: addDaysIso(3),
              message: "Checking in to see how the plan is going.",
              planId: plan.id,
            },
            reason: "Not enough evidence yet to recommend a specific plan change.",
            riskLevel: "low",
            requiresApproval: false,
          },
      requiresApproval: false,
      clarifyingQuestion: null,
      memoryCandidates: [],
    };
  }

  const proposedDays = plan.schedule.daysOfWeek.length >= 5 ? plan.schedule.daysOfWeek : [1, 2, 3, 4, 5];
  const currentPct = currentBucket ? pct(currentBucket.completionRate) : "an unclear rate";

  return {
    intent: "improve_adherence",
    confidence: 0.9,
    summary: phrase(user.preferences.communicationStyle, {
      concise: `Your ${best.durationMinutes}-minute sessions reached ${pct(best.completionRate)} completion versus ${currentPct} for ${plan.durationMinutes} minutes. Would you like to try the smaller step?`,
      supportive: `You've been finding ways to keep going. Your ${best.durationMinutes}-minute sessions reached ${pct(best.completionRate)} completion versus ${currentPct} for ${plan.durationMinutes} minutes; would you like to try that smaller step?`,
      direct: `Try ${best.durationMinutes}-minute sessions: they reached ${pct(best.completionRate)} completion versus ${currentPct} for ${plan.durationMinutes} minutes. Would you like to make that change?`,
    }),
    evidenceIds,
    nextStep: "Propose changing session duration to the better-performing length.",
    safetyConcern: "none",
    proposedAction: {
      actionType: "MODIFY_PLAN",
      parameters: {
        planId: plan.id,
        durationMinutes: best.durationMinutes,
        daysOfWeek: proposedDays,
        time: user.preferences.preferredSessionTime,
        reason: `Historical adherence is ${pct(best.completionRate)} for ${best.durationMinutes}-minute sessions vs ${currentPct} for the current plan.`,
      },
      reason: "Shorter sessions have a meaningfully higher completion rate for you.",
      riskLevel: "medium",
      requiresApproval: true,
    },
    requiresApproval: true,
    clarifyingQuestion: null,
    memoryCandidates: [
      {
        type: "pattern",
        content: `Completion is higher when sessions are ${best.durationMinutes} minutes or shorter.`,
        confidence: 0.85,
        expiresInDays: null,
      },
    ],
  };
}

export class DemoAgentProvider implements AgentProvider {
  readonly name = "demo" as const;

  async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
    const { context, intent } = input;

    if (intent.needsClarification || intent.intent === "unclear") {
      return {
        decision: clarifyingDecision(intent.clarifyingQuestion ?? "Could you tell me more about what you'd like help with?"),
        steps: ["Wasn't able to determine what you need"],
      };
    }

    if (intent.intent === "simple_query") {
      return { decision: simpleQueryDecision(context), steps: ["Answered directly from current context"] };
    }

    if (intent.intent === "improve_adherence") {
      return {
        decision: adherenceDecision(context),
        steps: ["Compared adherence across session durations", "Checked your stated preferences"],
      };
    }

    return { decision: generalDecision(context), steps: ["Prepared a general response from available context"] };
  }
}
