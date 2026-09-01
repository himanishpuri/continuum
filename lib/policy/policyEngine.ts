import type { ActionType, AgentPermissions, AutonomyLevel, RiskLevel } from "@/lib/types";

export interface PolicyInput {
  actionType: ActionType;
  permissions: AgentPermissions;
  autonomyLevel: AutonomyLevel;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  reason: string;
}

function allow(opts: { riskLevel: RiskLevel; requiresApproval: boolean; reason: string }): PolicyDecision {
  return { allowed: true, requiresApproval: opts.requiresApproval, riskLevel: opts.riskLevel, reason: opts.reason };
}

function deny(reason: string): PolicyDecision {
  return { allowed: false, requiresApproval: true, riskLevel: "prohibited", reason };
}

/**
 * The deterministic permission table from §20/§56. This is the one place
 * that decides whether an action is allowed and whether it needs the
 * user's approval — the model's own `requiresApproval` guess is advisory
 * only and is always overridden by this function before anything executes.
 */
export function evaluatePolicy({ actionType, permissions, autonomyLevel }: PolicyInput): PolicyDecision {
  switch (actionType) {
    case "HIGH_RISK_HEALTH_ACTION":
      return deny("Continuum never takes clinical, diagnostic, or medication actions.");

    case "SEND_EXTERNAL_MESSAGE":
      return allow({
        riskLevel: "high",
        requiresApproval: true,
        reason: "External messages always require your approval, regardless of autonomy level.",
      });

    case "CREATE_PLAN":
    case "MODIFY_PLAN":
      if (!permissions.canModifyPlans) return deny("Plan changes are disabled in your agent permissions.");
      return allow({
        riskLevel: "medium",
        requiresApproval: true,
        reason: "Changing your plan is consequential, so it always needs your approval.",
      });

    case "SCHEDULE_CHECKIN": {
      if (!permissions.canScheduleFollowups) return deny("Scheduling follow-ups is disabled in your agent permissions.");
      const requiresApproval = autonomyLevel === "conservative";
      return allow({
        riskLevel: "low",
        requiresApproval,
        reason: requiresApproval
          ? "Conservative autonomy asks before scheduling anything new."
          : "Scheduling a check-in doesn't change your plan, so it can happen automatically.",
      });
    }

    case "CREATE_MEMORY":
      return allow({ riskLevel: "low", requiresApproval: false, reason: "Recording a fact for later doesn't change anything today." });

    case "UPDATE_MEMORY":
      return allow({ riskLevel: "low", requiresApproval: false, reason: "Refining an existing memory doesn't change your plan." });

    case "DELETE_MEMORY":
      return allow({ riskLevel: "medium", requiresApproval: true, reason: "Deleting memory is irreversible, so it needs your approval." });

    case "RECORD_EVENT":
      return allow({ riskLevel: "low", requiresApproval: false, reason: "Recording an event is read/record-only." });

    default:
      return deny(`Unrecognized action type: ${actionType satisfies never}`);
  }
}
