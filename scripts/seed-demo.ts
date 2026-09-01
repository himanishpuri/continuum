/**
 * Seeds the demo user "Alex" (§27/§28): profile, preferences, three
 * semantic memories, a plan with a v1→v2→v3 version history, and enough
 * historical session events to make the agent's evidence real — 15-minute
 * sessions land around 82% completion, 30-minute sessions around 39%.
 * Run with `npm run seed`. Safe to re-run against the local JSON store
 * (it clears the demo user's data directory first); re-running against a
 * live Firestore project will create duplicate records, so only seed a
 * fresh project once.
 */
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";

config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { getRepositories, isUsingLocalStore } = await import("../lib/repositories");
  const DEMO_USER_ID = "demo-user";

  if (isUsingLocalStore()) {
    const dir = path.resolve(process.cwd(), process.env.DEMO_DATA_DIR || ".demo-data", DEMO_USER_ID);
    await fs.rm(dir, { recursive: true, force: true });
  }

  const repos = getRepositories();
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const v1CreatedAt = daysAgo(21).toISOString();
  const v2CreatedAt = daysAgo(14).toISOString();
  const v3CreatedAt = daysAgo(7).toISOString();

  await repos.users.createUser({
    profile: {
      uid: DEMO_USER_ID,
      name: "Alex",
      email: "alex@example.com",
      timezone: "America/New_York",
      createdAt: v1CreatedAt,
      isDemo: true,
    },
    preferences: {
      preferredSessionTime: "19:00",
      preferredDurationMinutes: 15,
      communicationStyle: "supportive",
      reminderEnabled: true,
    },
    settings: {
      autonomyLevel: "balanced",
      permissions: {
        canCreateReminders: true,
        canModifyPlans: true,
        canScheduleFollowups: true,
        requireApprovalForExternalActions: true,
      },
      geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
    },
  });

  const memoryDefs: { type: "preference" | "pattern" | "goal"; content: string; confidence: number }[] = [
    { type: "preference", content: "Prefers evening sessions.", confidence: 0.9 },
    { type: "preference", content: "Prefers shorter sessions.", confidence: 0.85 },
    { type: "pattern", content: "Completion is higher when sessions are under 20 minutes.", confidence: 0.88 },
    { type: "goal", content: "Goal is to improve consistency.", confidence: 0.95 },
  ];
  for (const m of memoryDefs) {
    await repos.memories.create(DEMO_USER_ID, {
      type: m.type,
      content: m.content,
      confidence: m.confidence,
      source: "seed",
      createdAt: v1CreatedAt,
      updatedAt: v1CreatedAt,
      lastUsedAt: null,
      expiresAt: null,
    });
  }

  const successMetrics = ["Increase weekly completion rate above 80%", "Maintain a 5+ day streak"];
  const plan = await repos.plans.create(DEMO_USER_ID, {
    title: "Evening Recovery Routine",
    goal: "Improve consistency",
    description: "A short evening routine focused on steady, sustainable adherence rather than long sessions.",
    schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" },
    durationMinutes: 15,
    frequencyLabel: "Mon-Fri",
    status: "active",
    version: 3,
    successMetrics,
    checkinFrequencyDays: 7,
    createdAt: v1CreatedAt,
    updatedAt: v3CreatedAt,
  });

  const baseSnapshot = {
    userId: DEMO_USER_ID,
    title: plan.title,
    goal: plan.goal,
    description: plan.description,
    status: "active" as const,
    successMetrics,
    checkinFrequencyDays: 7,
  };

  await repos.planVersions.create(DEMO_USER_ID, {
    planId: plan.id,
    version: 1,
    snapshot: {
      ...baseSnapshot,
      schedule: { daysOfWeek: [1, 3, 5], time: "19:00" },
      durationMinutes: 30,
      frequencyLabel: "Mon, Wed, Fri",
      version: 1,
      createdAt: v1CreatedAt,
      updatedAt: v1CreatedAt,
    },
    changes: [],
    reason: "Initial plan created.",
    evidenceIds: [],
    createdAt: v1CreatedAt,
    createdBy: "user",
  });

  await repos.planVersions.create(DEMO_USER_ID, {
    planId: plan.id,
    version: 2,
    snapshot: {
      ...baseSnapshot,
      schedule: { daysOfWeek: [1, 2, 3, 4], time: "19:00" },
      durationMinutes: 20,
      frequencyLabel: "Mon, Tue, Wed, Thu",
      version: 2,
      createdAt: v1CreatedAt,
      updatedAt: v2CreatedAt,
    },
    changes: [
      { field: "durationMinutes", from: 30, to: 20 },
      { field: "schedule.daysOfWeek", from: [1, 3, 5], to: [1, 2, 3, 4] },
      { field: "frequencyLabel", from: "Mon, Wed, Fri", to: "Mon, Tue, Wed, Thu" },
    ],
    reason: "30-minute sessions were being missed often; shortened and added a day.",
    evidenceIds: [],
    createdAt: v2CreatedAt,
    createdBy: "agent",
  });

  await repos.planVersions.create(DEMO_USER_ID, {
    planId: plan.id,
    version: 3,
    snapshot: {
      ...baseSnapshot,
      schedule: { daysOfWeek: [1, 2, 3, 4, 5], time: "19:00" },
      durationMinutes: 15,
      frequencyLabel: "Mon-Fri",
      version: 3,
      createdAt: v1CreatedAt,
      updatedAt: v3CreatedAt,
    },
    changes: [
      { field: "durationMinutes", from: 20, to: 15 },
      { field: "schedule.daysOfWeek", from: [1, 2, 3, 4], to: [1, 2, 3, 4, 5] },
      { field: "frequencyLabel", from: "Mon, Tue, Wed, Thu", to: "Mon-Fri" },
    ],
    reason: "Historical adherence is significantly higher for 15-minute sessions at the user's preferred evening time.",
    evidenceIds: ["completion_15m", "completion_30m", "preferred_time"],
    createdAt: v3CreatedAt,
    createdBy: "agent",
  });

  // --- Session history: engineered so 15-minute sessions land near 82%
  // completion and 30-minute sessions near 39%, giving the agent real
  // evidence to cite rather than fabricated-sounding round numbers. ---
  function walkBackWeekdays(from: Date, allowedDays: number[], count: number): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(from);
    while (dates.length < count) {
      if (allowedDays.includes(cursor.getDay())) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }
    return dates;
  }

  const yesterday = daysAgo(1);
  const recentDays = walkBackWeekdays(yesterday, [1, 2, 3, 4, 5], 11); // most-recent-first, 15-minute plan
  const oldStart = new Date(recentDays[recentDays.length - 1]);
  oldStart.setDate(oldStart.getDate() - 1);
  const oldDays = walkBackWeekdays(oldStart, [1, 3, 5], 13); // older 30-minute plan

  const recentMissedIdx = new Set([4, 5]); // 9/11 completed ≈ 82%
  const oldCompletedIdx = new Set([0, 3, 6, 9, 12]); // 5/13 completed ≈ 39%

  const atSevenPm = (d: Date) => {
    const t = new Date(d);
    t.setHours(19, 0, 0, 0);
    return t;
  };

  for (const [idx, date] of recentDays.entries()) {
    const completed = !recentMissedIdx.has(idx);
    await repos.events.create(DEMO_USER_ID, {
      type: completed ? "SESSION_COMPLETED" : "SESSION_MISSED",
      timestamp: atSevenPm(date).toISOString(),
      source: "system",
      payload: { durationMinutes: 15, reportedVia: "seed" },
      summary: completed ? "15-minute evening session completed." : "15-minute evening session missed.",
    });
  }

  for (const [idx, date] of oldDays.entries()) {
    const completed = oldCompletedIdx.has(idx);
    await repos.events.create(DEMO_USER_ID, {
      type: completed ? "SESSION_COMPLETED" : "SESSION_MISSED",
      timestamp: atSevenPm(date).toISOString(),
      source: "system",
      payload: { durationMinutes: 30, reportedVia: "seed" },
      summary: completed ? "30-minute evening session completed." : "30-minute evening session missed.",
    });
  }

  // --- Check-ins: one already due (for the /api/dev/run-due-checkins demo), one upcoming. ---
  await repos.checkins.create(DEMO_USER_ID, {
    planId: plan.id,
    scheduledAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    completedAt: null,
    status: "pending",
    message: "How are your evening sessions feeling this week?",
    response: null,
    createdBy: "agent",
    createdAt: v3CreatedAt,
  });

  const tomorrow7pm = atSevenPm(daysAgo(-1));
  await repos.checkins.create(DEMO_USER_ID, {
    planId: plan.id,
    scheduledAt: tomorrow7pm.toISOString(),
    completedAt: null,
    status: "pending",
    message: "Checking in on this week's progress.",
    response: null,
    createdBy: "agent",
    createdAt: now.toISOString(),
  });

  // --- A short, realistic activity history predating the live demo interaction. ---
  const proposedAt = new Date(v3CreatedAt);
  await repos.events.create(DEMO_USER_ID, {
    type: "PLAN_PROPOSED",
    timestamp: proposedAt.toISOString(),
    source: "agent",
    payload: {},
    summary: "Continuum proposed shortening sessions to 15 minutes based on adherence history.",
  });
  await repos.events.create(DEMO_USER_ID, {
    type: "ACTION_APPROVED",
    timestamp: new Date(proposedAt.getTime() + 5 * 60000).toISOString(),
    source: "user",
    payload: {},
    summary: "Approved: shorten sessions to 15 minutes.",
  });
  await repos.events.create(DEMO_USER_ID, {
    type: "PLAN_UPDATED",
    timestamp: new Date(proposedAt.getTime() + 6 * 60000).toISOString(),
    source: "agent",
    payload: {},
    summary: "Updated plan to v3 (duration, schedule, frequency).",
  });
  await repos.events.create(DEMO_USER_ID, {
    type: "CHECKIN_COMPLETED",
    timestamp: daysAgo(2).toISOString(),
    source: "background",
    payload: { outcome: "no_action_needed" },
    summary: "Agent checked progress — no intervention needed.",
  });

  console.log(`Seeded demo user "${DEMO_USER_ID}" with plan "${plan.title}" (v${plan.version}).`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
