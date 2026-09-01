import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/policy/policyEngine";
import type { AgentPermissions } from "@/lib/types";

const permissions: AgentPermissions = {
  canCreateReminders: true,
  canModifyPlans: true,
  canScheduleFollowups: true,
  requireApprovalForExternalActions: true,
};

describe("policyEngine", () => {
  it("allows a safe, low-risk action without approval", () => {
    const result = evaluatePolicy({ actionType: "CREATE_MEMORY", permissions, autonomyLevel: "balanced" });
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("requires approval for a consequential plan change regardless of autonomy level", () => {
    const conservative = evaluatePolicy({ actionType: "MODIFY_PLAN", permissions, autonomyLevel: "conservative" });
    const autonomous = evaluatePolicy({ actionType: "MODIFY_PLAN", permissions, autonomyLevel: "autonomous" });
    expect(conservative.requiresApproval).toBe(true);
    expect(autonomous.requiresApproval).toBe(true);
  });

  it("always prohibits high-risk health actions, even under full autonomy", () => {
    const result = evaluatePolicy({ actionType: "HIGH_RISK_HEALTH_ACTION", permissions, autonomyLevel: "autonomous" });
    expect(result.allowed).toBe(false);
  });

  it("denies plan modification entirely when the permission is disabled", () => {
    const result = evaluatePolicy({ actionType: "MODIFY_PLAN", permissions: { ...permissions, canModifyPlans: false }, autonomyLevel: "balanced" });
    expect(result.allowed).toBe(false);
  });

  it("auto-allows scheduling a check-in under balanced/autonomous but asks first under conservative", () => {
    const conservative = evaluatePolicy({ actionType: "SCHEDULE_CHECKIN", permissions, autonomyLevel: "conservative" });
    const balanced = evaluatePolicy({ actionType: "SCHEDULE_CHECKIN", permissions, autonomyLevel: "balanced" });
    expect(conservative.requiresApproval).toBe(true);
    expect(balanced.requiresApproval).toBe(false);
  });

  it("always requires approval for external messages", () => {
    const result = evaluatePolicy({ actionType: "SEND_EXTERNAL_MESSAGE", permissions, autonomyLevel: "autonomous" });
    expect(result.requiresApproval).toBe(true);
  });
});
