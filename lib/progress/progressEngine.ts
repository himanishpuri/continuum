import { addDays, format, isAfter, parseISO, startOfDay, subDays } from "date-fns";
import type { DayOutcome, EventRecord, Plan, ProgressSnapshot } from "@/lib/types";

const WINDOW_DAYS = 30;
const TREND_THRESHOLD = 0.1;

interface SessionEvent {
  date: string; // yyyy-MM-dd
  status: "completed" | "missed";
  durationMinutes: number;
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toSessionEvents(events: EventRecord[]): SessionEvent[] {
  return events
    .filter((e) => e.type === "SESSION_COMPLETED" || e.type === "SESSION_MISSED")
    .map((e) => ({
      date: dateKey(parseISO(e.timestamp)),
      status: e.type === "SESSION_COMPLETED" ? ("completed" as const) : ("missed" as const),
      durationMinutes: typeof e.payload.durationMinutes === "number" ? (e.payload.durationMinutes as number) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** yyyy-MM-dd -> every session logged that day (a day can have several). */
function groupByDate(sessions: SessionEvent[]): Map<string, SessionEvent[]> {
  const byDate = new Map<string, SessionEvent[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  return byDate;
}

function dayHasCompleted(day: SessionEvent[] | undefined): boolean {
  return Boolean(day?.some((s) => s.status === "completed"));
}

function computeStreak(sessions: SessionEvent[], plan: Plan | null, today: Date): number {
  const byDate = groupByDate(sessions);
  const todayKey = dateKey(today);
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const day = subDays(today, i);
    const key = dateKey(day);
    const daySessions = byDate.get(key);
    if (dayHasCompleted(daySessions)) {
      streak += 1;
      continue;
    }
    // A day with only misses breaks the streak; a completed session that day
    // would already have been caught above.
    if (daySessions && daySessions.length > 0) break;
    const isScheduledDay = plan ? plan.schedule.daysOfWeek.includes(day.getDay()) : false;
    if (isScheduledDay && key !== todayKey) break;
    // Unscheduled rest day, or today's session hasn't happened yet: skip.
  }
  return streak;
}

function countScheduledDays(plan: Plan, start: Date, end: Date): number {
  let count = 0;
  let cursor = start;
  while (!isAfter(cursor, end)) {
    if (plan.schedule.daysOfWeek.includes(cursor.getDay())) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function computeCompletionByDuration(sessions: SessionEvent[]) {
  const groups = new Map<number, { completed: number; total: number }>();
  for (const s of sessions) {
    const g = groups.get(s.durationMinutes) ?? { completed: 0, total: 0 };
    g.total += 1;
    if (s.status === "completed") g.completed += 1;
    groups.set(s.durationMinutes, g);
  }
  return Array.from(groups.entries())
    .map(([durationMinutes, g]) => ({
      durationMinutes,
      completionRate: g.total > 0 ? g.completed / g.total : 0,
      sampleSize: g.total,
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

function computeTimeline(sessions: SessionEvent[], today: Date): DayOutcome[] {
  const byDate = groupByDate(sessions);
  const days: DayOutcome[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const key = dateKey(day);
    const daySessions = byDate.get(key) ?? [];
    const completed = daySessions.filter((s) => s.status === "completed");
    const missedCount = daySessions.length - completed.length;
    const completedMinutes = completed.reduce((sum, s) => sum + s.durationMinutes, 0);
    days.push({
      date: key,
      status: completed.length > 0 ? "completed" : missedCount > 0 ? "missed" : "no_session",
      durationMinutes: completedMinutes || null,
      completedCount: completed.length,
      missedCount,
    });
  }
  return days;
}

/**
 * Deterministic statistics over recorded session events (§53). Gemini
 * never computes these numbers — it only reasons about the result.
 */
export function computeProgressSnapshot(events: EventRecord[], plan: Plan | null, now: Date = new Date()): ProgressSnapshot {
  const sessions = toSessionEvents(events);
  const today = startOfDay(now);
  const windowStartKey = dateKey(subDays(today, WINDOW_DAYS - 1));
  const inWindow = sessions.filter((s) => s.date >= windowStartKey);
  const completionRate = inWindow.length > 0 ? inWindow.filter((s) => s.status === "completed").length / inWindow.length : 0;

  const last7StartKey = dateKey(subDays(today, 6));
  const todayKey = dateKey(today);
  const last7 = sessions.filter((s) => s.date >= last7StartKey && s.date <= todayKey);
  const weeklyCompleted = last7.filter((s) => s.status === "completed").length;
  const weeklyMissed = last7.length - weeklyCompleted;
  const weeklyPlanned = plan ? countScheduledDays(plan, subDays(today, 6), today) : last7.length;
  const weeklyLogged = weeklyCompleted + weeklyMissed;
  const weeklyCompletionRate = weeklyLogged > 0 ? weeklyCompleted / weeklyLogged : 0;

  const completedInWindow = inWindow.filter((s) => s.status === "completed");
  const averageDurationMinutes =
    completedInWindow.length > 0
      ? Math.round(completedInWindow.reduce((sum, s) => sum + s.durationMinutes, 0) / completedInWindow.length)
      : (plan?.durationMinutes ?? 0);

  const prev7StartKey = dateKey(subDays(today, 13));
  const prev7EndKey = dateKey(subDays(today, 7));
  const prev7 = sessions.filter((s) => s.date >= prev7StartKey && s.date <= prev7EndKey);
  const recentRate = last7.length > 0 ? weeklyCompleted / last7.length : null;
  const priorRate = prev7.length > 0 ? prev7.filter((s) => s.status === "completed").length / prev7.length : null;
  let trend: ProgressSnapshot["trend"] = "stable";
  if (recentRate !== null && priorRate !== null) {
    if (recentRate - priorRate > TREND_THRESHOLD) trend = "improving";
    else if (priorRate - recentRate > TREND_THRESHOLD) trend = "declining";
  }

  return {
    completionRate,
    streakDays: computeStreak(sessions, plan, today),
    weeklyPlanned,
    weeklyCompleted,
    weeklyMissed,
    weeklyCompletionRate,
    averageDurationMinutes,
    trend,
    completionByDuration: computeCompletionByDuration(sessions),
    timeline: computeTimeline(sessions, today),
  };
}
