import { describe, expect, it } from "vitest";
import { computeProgressSnapshot } from "@/lib/progress/progressEngine";
import type { EventRecord, Plan } from "@/lib/types";

function sessionEvent(now: Date, daysAgo: number, type: "SESSION_COMPLETED" | "SESSION_MISSED", durationMinutes: number): EventRecord {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(19, 0, 0, 0);
  return { id: `e-${daysAgo}-${durationMinutes}-${type}`, userId: "u", type, timestamp: d.toISOString(), source: "system", payload: { durationMinutes }, summary: "" };
}

function everydayPlan(now: Date): Plan {
  return {
    id: "p",
    userId: "u",
    title: "Test",
    goal: "Test",
    description: "",
    schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], time: "19:00" },
    durationMinutes: 15,
    frequencyLabel: "Every day",
    status: "active",
    version: 1,
    successMetrics: [],
    checkinFrequencyDays: 7,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

describe("progressEngine", () => {
  it("computes completion rate broken down by session duration (§49 evidence)", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const plan = everydayPlan(now);
    const events: EventRecord[] = [];
    for (let i = 15; i < 15 + 9; i++) events.push(sessionEvent(now, i, "SESSION_COMPLETED", 15));
    for (let i = 24; i < 24 + 2; i++) events.push(sessionEvent(now, i, "SESSION_MISSED", 15));
    for (let i = 30; i < 30 + 5; i++) events.push(sessionEvent(now, i, "SESSION_COMPLETED", 30));
    for (let i = 35; i < 35 + 8; i++) events.push(sessionEvent(now, i, "SESSION_MISSED", 30));

    const snapshot = computeProgressSnapshot(events, plan, now);
    const bucket15 = snapshot.completionByDuration.find((b) => b.durationMinutes === 15)!;
    const bucket30 = snapshot.completionByDuration.find((b) => b.durationMinutes === 30)!;

    expect(bucket15.completionRate).toBeCloseTo(9 / 11, 2);
    expect(bucket30.completionRate).toBeCloseTo(5 / 13, 2);
  });

  it("computes a streak that stops at the first missed scheduled day", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const plan = everydayPlan(now);
    const events: EventRecord[] = [
      sessionEvent(now, 1, "SESSION_COMPLETED", 15),
      sessionEvent(now, 2, "SESSION_COMPLETED", 15),
      sessionEvent(now, 3, "SESSION_COMPLETED", 15),
      sessionEvent(now, 4, "SESSION_MISSED", 15),
    ];
    const snapshot = computeProgressSnapshot(events, plan, now);
    expect(snapshot.streakDays).toBe(3);
  });

  it("does not invent data: an empty event log yields zeroed-out, not fabricated, stats", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const snapshot = computeProgressSnapshot([], everydayPlan(now), now);
    expect(snapshot.completionRate).toBe(0);
    expect(snapshot.streakDays).toBe(0);
    expect(snapshot.completionByDuration).toHaveLength(0);
  });

  it("keeps every session when a day has several, instead of showing only one", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const plan = everydayPlan(now);
    const events: EventRecord[] = [
      sessionEvent(now, 0, "SESSION_COMPLETED", 40),
      sessionEvent(now, 0, "SESSION_COMPLETED", 35),
      sessionEvent(now, 0, "SESSION_MISSED", 45),
    ];
    const snapshot = computeProgressSnapshot(events, plan, now);
    const today = snapshot.timeline.at(-1)!;

    expect(today.completedCount).toBe(2);
    expect(today.missedCount).toBe(1);
    expect(today.status).toBe("completed"); // a completed session isn't hidden by a same-day miss
    expect(today.durationMinutes).toBe(75); // 40 + 35
    expect(snapshot.streakDays).toBe(1); // the day counts as completed for the streak
    expect(snapshot.weeklyCompleted).toBe(2);
    expect(snapshot.weeklyMissed).toBe(1);
    expect(snapshot.weeklyCompletionRate).toBeCloseTo(2 / 3, 2); // completed / (completed + missed)
  });
});
