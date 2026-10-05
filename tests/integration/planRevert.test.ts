import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { POST } from "@/app/api/plans/[id]/revert/route";
import { proposeAction } from "@/lib/tools/actionService";

const state = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/apiAuth", () => ({ requireApiUser: async () => ({ user: { uid: state.userId } }) }));

describe("plan restore", () => {
  it("restores the full snapshot as a user action, is retry-safe, and rejects the current version", async () => {
    const repos = getRepositories();
    const userId = `restore-${randomUUID()}`;
    state.userId = userId;
    const now = new Date().toISOString();
    const permissions = {
      canCreateReminders: true,
      canModifyPlans: false,
      canScheduleFollowups: true,
      requireApprovalForExternalActions: true,
    };
    await repos.users.createUser({
      profile: { uid: userId, name: "Test", email: null, timezone: "UTC", createdAt: now, isDemo: true },
      preferences: { preferredSessionTime: "19:00", preferredDurationMinutes: 15, communicationStyle: "supportive", reminderEnabled: true },
      settings: { autonomyLevel: "conservative", permissions, geminiModel: "gemini-flash-latest" },
    });
    const plan = await repos.plans.create(userId, {
      title: "First", goal: "Feel well", description: "A gentle routine",
      schedule: { daysOfWeek: [1, 3], time: "19:00" }, durationMinutes: 15,
      frequencyLabel: "Mon, Wed", status: "active", version: 1,
      successMetrics: ["Show up"], checkinFrequencyDays: 3, createdAt: now, updatedAt: now,
    });
    const { id: _id, ...snapshot } = plan;
    await repos.planVersions.create(userId, {
      planId: plan.id, version: 1, snapshot, changes: [], reason: "Initial", evidenceIds: [], createdAt: now, createdBy: "agent",
    });
    await repos.plans.update(userId, plan.id, {
      title: "Second", goal: "Run fast", description: "Hard routine",
      schedule: { daysOfWeek: [2, 4, 6], time: "07:00" }, durationMinutes: 45,
      frequencyLabel: "Tue, Thu, Sat", successMetrics: ["Speed"], checkinFrequencyDays: 7, status: "paused", version: 2,
    });
    const request = () => new Request("http://localhost/api/plans/revert", { method: "POST", body: JSON.stringify({ version: 1 }) });
    const params = { params: Promise.resolve({ id: plan.id }) };
    const first = await POST(request(), params);
    expect(first.status).toBe(200);
    const restored = await repos.plans.get(userId, plan.id);
    expect(restored).toMatchObject({
      title: snapshot.title, goal: snapshot.goal, description: snapshot.description,
      schedule: snapshot.schedule, durationMinutes: snapshot.durationMinutes,
      frequencyLabel: snapshot.frequencyLabel, successMetrics: snapshot.successMetrics,
      checkinFrequencyDays: snapshot.checkinFrequencyDays, status: snapshot.status, version: 3,
    });
    const versions = await repos.planVersions.listByPlan(userId, plan.id);
    expect(versions.find((version) => version.version === 3)?.createdBy).toBe("user");
    const events = await repos.events.list(userId);
    expect(events.find((event) => event.type === "PLAN_UPDATED" && event.summary === "Restored plan to v1")?.source).toBe("user");

    const second = await POST(request(), params);
    expect(second.status).toBe(200);
    expect((await repos.plans.get(userId, plan.id))?.version).toBe(3);
    expect(await repos.planVersions.listByPlan(userId, plan.id)).toHaveLength(2);
    const current = await POST(new Request("http://localhost/api/plans/revert", { method: "POST", body: JSON.stringify({ version: 3 }) }), params);
    expect(current.status).toBe(409);
    const prohibited = await proposeAction(userId, {
      proposal: { actionType: "HIGH_RISK_HEALTH_ACTION", parameters: {}, reason: "test", riskLevel: "prohibited", requiresApproval: true },
      evidenceIds: [], permissions, autonomyLevel: "conservative", initiatedBy: "user",
    });
    expect(prohibited.allowed).toBe(false);
  });
});
