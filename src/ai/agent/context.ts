import { getRepositories } from "@/lib/repositories";
import { retrieveRelevantMemories, summarizeMemories } from "@/lib/memory/memoryService";
import { computeProgressSnapshot } from "@/lib/progress/progressEngine";
import { buildEvidence } from "@/lib/evidence/evidenceEngine";
import type { CheckIn, Evidence, Memory, Plan, ProgressSnapshot, UserRecord } from "@/lib/types";

export interface AgentContext {
  user: UserRecord;
  memories: Memory[];
  plan: Plan | null;
  progress: ProgressSnapshot;
  evidence: Evidence[];
  /** Pending (not-yet-completed) check-ins, soonest first — so the agent doesn't schedule another on top. */
  pendingCheckins: CheckIn[];
  /** ISO instant this context was assembled — the model's reference for resolving "yesterday", "on Wednesday", etc. */
  now: string;
  /** Human-readable labels for work already done while assembling this context — surfaced in the Agent Run UI (§9). */
  retrievedSteps: string[];
}

/**
 * RETRIEVE_CONTEXT (§17/§22): assembles everything the agent needs in one
 * pass, deterministically, before any model call — cheaper and more
 * reliable than letting the model fetch each piece itself, and it's what
 * lets DemoAgentProvider reason over exactly the same context as Gemini.
 */
export async function buildAgentContext(userId: string): Promise<AgentContext> {
  const repos = getRepositories();
  const user = await repos.users.getUser(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  const [memories, plan, events, checkins] = await Promise.all([
    retrieveRelevantMemories(userId),
    repos.plans.getActive(userId),
    repos.events.list(userId, { types: ["SESSION_COMPLETED", "SESSION_MISSED"], limit: 200 }),
    repos.checkins.list(userId),
  ]);

  const now = new Date();
  const progress = computeProgressSnapshot(events, plan, now);
  const evidence = buildEvidence(progress, plan, user.preferences, now);
  const pendingCheckins = checkins
    .filter((c) => c.status === "pending")
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));

  return {
    user,
    memories,
    plan,
    progress,
    evidence,
    pendingCheckins,
    now: now.toISOString(),
    retrievedSteps: [
      "Retrieved relevant history",
      plan ? "Reviewed your current plan" : "Checked for an existing plan (none found)",
      "Compared recent adherence",
    ],
  };
}

export function summarizePlan(plan: Plan | null): string {
  if (!plan) return "No active plan yet.";
  return `"${plan.title}" — ${plan.durationMinutes} min, ${plan.frequencyLabel} at ${plan.schedule.time} (v${plan.version}, status: ${plan.status}).`;
}

export function summarizeProgress(progress: ProgressSnapshot): string {
  const lines = [
    `Completion rate (last 30 days): ${Math.round(progress.completionRate * 100)}%`,
    `This week: ${progress.weeklyCompleted} completed, ${progress.weeklyMissed} missed (${progress.weeklyPlanned} scheduled plan-day${progress.weeklyPlanned === 1 ? "" : "s"})`,
    `Current streak: ${progress.streakDays} day(s)`,
    `Trend: ${progress.trend}`,
    `Average session length: ${progress.averageDurationMinutes} min`,
  ];
  for (const bucket of progress.completionByDuration) {
    if (bucket.sampleSize < 2) continue;
    lines.push(`${bucket.durationMinutes}-minute sessions: ${Math.round(bucket.completionRate * 100)}% completion (${bucket.sampleSize} sessions)`);
  }
  return lines.join("\n");
}

export function summarizeEvidence(evidence: Evidence[]): string {
  return evidence.map((e) => `- [${e.id}] ${e.label}: ${e.value}`).join("\n");
}

export function buildContextBlock(context: AgentContext): string {
  const now = new Date(context.now);
  const nowLine = `${context.now} (${now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}, UTC)`;
  return [
    `CURRENT DATE & TIME: ${nowLine}`,
    `Resolve any relative date the user mentions ("yesterday", "this morning", "on Wednesday") against this.`,
    ``,
    `USER PROFILE`,
    `Name: ${context.user.profile.name}`,
    `Timezone: ${context.user.profile.timezone}`,
    ``,
    `PREFERENCES`,
    `Preferred time: ${context.user.preferences.preferredSessionTime}`,
    `Preferred duration: ${context.user.preferences.preferredDurationMinutes} minutes`,
    `Communication style: ${context.user.preferences.communicationStyle}`,
    ``,
    `RELEVANT MEMORY`,
    summarizeMemories(context.memories),
    ``,
    `CURRENT PLAN`,
    summarizePlan(context.plan),
    ``,
    `PENDING CHECK-INS`,
    context.pendingCheckins.length === 0
      ? "None scheduled."
      : `${context.pendingCheckins.length} already scheduled; next on ${context.pendingCheckins[0].scheduledAt}. Do not schedule another.`,
    ``,
    `RECENT PROGRESS`,
    summarizeProgress(context.progress),
    ``,
    `AVAILABLE EVIDENCE (cite by id in evidenceIds — do not invent new ids)`,
    summarizeEvidence(context.evidence),
  ].join("\n");
}
