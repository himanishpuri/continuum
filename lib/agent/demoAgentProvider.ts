import type { AgentDecision } from "@/src/ai/schemas/agentSchemas";
import type { AgentContext } from "@/src/ai/agent/context";
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

function simpleQueryDecision(context: AgentContext): AgentDecision {
  const { plan } = context;
  const summary = plan
    ? `Your next session is ${plan.durationMinutes} minutes, ${plan.frequencyLabel} at ${formatTime(plan.schedule.time)}. You're currently on a ${context.progress.streakDays}-day streak.`
    : "You don't have an active plan yet — tell me about a routine you'd like help with and I can propose one.";
  return {
    intent: "simple_query",
    confidence: 0.95,
    summary,
    evidenceIds: plan ? ["current_plan_duration", "streak"] : [],
    nextStep: "None needed.",
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
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion: question,
    memoryCandidates: [],
  };
}

function generalDecision(): AgentDecision {
  return {
    intent: "general_request",
    confidence: 0.5,
    summary: "I'm here to help with your routines, scheduling, and wellbeing planning. Let me know what you'd like to work on.",
    evidenceIds: [],
    nextStep: "Await further detail from the user.",
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
      summary: "You don't have an active plan yet, so there's nothing to compare against. Tell me about the routine you'd like help with and I can propose a starting plan.",
      evidenceIds: [],
      nextStep: "Propose an initial plan once the user describes their goal.",
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
  const meaningfulGap = Boolean(best) && best.completionRate - (currentBucket?.completionRate ?? 0) >= 0.15;

  if (alreadyOptimal && currentBucket) {
    return {
      intent: "improve_adherence",
      confidence: 0.75,
      summary: `Your ${currentBucket.durationMinutes}-minute sessions already have your best completion rate (${pct(currentBucket.completionRate)}) — you're on the right plan. I'd recommend keeping this week's sessions as-is.`,
      evidenceIds,
      nextStep: checkinPending ? "Keep the current plan; a check-in is already scheduled." : "Keep the current plan; schedule a confirmation check-in.",
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
      summary: `Your overall completion rate over the last 30 days is ${pct(progress.completionRate)}, and it isn't clearly tied to session length yet. Rather than guess at a change, I'd like to see how a few more sessions go first.`,
      evidenceIds,
      nextStep: checkinPending ? "Wait for more session data; a check-in is already scheduled." : "Schedule a check-in to gather more data before recommending a change.",
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
    summary: `I noticed something useful: your ${best.durationMinutes}-minute sessions have a ${pct(best.completionRate)} completion rate, compared to ${currentPct} for your current ${plan.durationMinutes}-minute sessions. Shorter sessions at your preferred time seem to work much better for you.`,
    evidenceIds,
    nextStep: "Propose changing session duration to the better-performing length.",
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

    return { decision: generalDecision(), steps: ["Prepared a general response from available context"] };
  }
}
