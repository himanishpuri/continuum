import type { Evidence, Plan, ProgressSnapshot, UserPreferences } from "@/lib/types";

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Turns deterministic progress numbers into small, citable evidence items
 * (§54). The agent references these by id instead of restating raw
 * numbers itself, and the frontend renders exactly this list — never
 * hidden chain-of-thought.
 */
export function buildEvidence(
  snapshot: ProgressSnapshot,
  plan: Plan | null,
  preferences: UserPreferences,
  now: Date = new Date()
): Evidence[] {
  const timestamp = now.toISOString();
  const evidence: Evidence[] = [];

  for (const bucket of snapshot.completionByDuration) {
    if (bucket.sampleSize < 2) continue;
    evidence.push({
      id: `completion_${bucket.durationMinutes}m`,
      type: "adherence_stat",
      label: `${bucket.durationMinutes}-minute sessions`,
      value: `${Math.round(bucket.completionRate * 100)}% completion (${bucket.sampleSize} sessions)`,
      source: "events",
      timestamp,
    });
  }

  evidence.push({
    id: "preferred_time",
    type: "preference",
    label: "Preferred time",
    value: formatTime(preferences.preferredSessionTime),
    source: "memory",
    timestamp,
  });

  evidence.push({
    id: "weekly_completion",
    type: "adherence_stat",
    label: "This week",
    value: `${snapshot.weeklyCompleted} of ${snapshot.weeklyPlanned} sessions (${Math.round(snapshot.weeklyCompletionRate * 100)}%)`,
    source: "events",
    timestamp,
  });

  evidence.push({
    id: "streak",
    type: "streak",
    label: "Current streak",
    value: `${snapshot.streakDays} day${snapshot.streakDays === 1 ? "" : "s"}`,
    source: "events",
    timestamp,
  });

  evidence.push({
    id: "trend",
    type: "trend",
    label: "Adherence trend",
    value: snapshot.trend,
    source: "events",
    timestamp,
  });

  if (plan) {
    evidence.push({
      id: "current_plan_duration",
      type: "preference",
      label: "Current plan",
      value: `${plan.durationMinutes} min · ${plan.frequencyLabel}`,
      source: "plan",
      timestamp,
    });
  }

  return evidence;
}

export function findEvidence(all: Evidence[], ids: string[]): Evidence[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
}
