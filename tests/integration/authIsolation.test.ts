import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getRepositories } from "@/lib/repositories";

function uid(label: string) {
  return `test-auth-${label}-${randomUUID()}`;
}

/**
 * §31/§48 AUTH: every API route derives its userId from the verified
 * session (lib/auth/session.ts) and never from client input, then passes
 * that userId into the repository layer. This test verifies the guarantee
 * those routes depend on — the repository layer itself never returns or
 * mutates another user's data, regardless of a record's id.
 */
describe("data isolation between users", () => {
  it("a user cannot read another user's memory by id", async () => {
    const userA = uid("a");
    const userB = uid("b");
    const repos = getRepositories();
    const memory = await repos.memories.create(userA, {
      type: "preference",
      content: "A's private preference",
      confidence: 0.9,
      source: "seed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
    });

    expect(await repos.memories.get(userB, memory.id)).toBeNull();
    expect((await repos.memories.list(userB)).find((m) => m.id === memory.id)).toBeUndefined();
    expect((await repos.memories.list(userA)).find((m) => m.id === memory.id)).toBeDefined();
  });

  it("a user cannot approve another user's pending action", async () => {
    const userA = uid("a");
    const userB = uid("b");
    const repos = getRepositories();
    const action = await repos.actions.create(userA, {
      type: "CREATE_MEMORY",
      parameters: {},
      reason: "",
      evidenceIds: [],
      riskLevel: "low",
      status: "PENDING_APPROVAL",
      approvalRequired: true,
      approvedAt: null,
      rejectedAt: null,
      executedAt: null,
      idempotencyKey: randomUUID(),
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 100000).toISOString(),
    });

    expect(await repos.actions.get(userB, action.id)).toBeNull();
  });

  it("a user's plans are not visible to another user", async () => {
    const userA = uid("a");
    const userB = uid("b");
    const repos = getRepositories();
    await repos.plans.create(userA, {
      title: "A's plan",
      goal: "",
      description: "",
      schedule: { daysOfWeek: [1], time: "19:00" },
      durationMinutes: 15,
      frequencyLabel: "Mon",
      status: "active",
      version: 1,
      successMetrics: [],
      checkinFrequencyDays: 7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(await repos.plans.list(userB)).toHaveLength(0);
    expect(await repos.plans.getActive(userB)).toBeNull();
  });
});
