import { z } from "genkit";

/**
 * Structured shape the model must use when proposing an action. This is
 * never trusted blindly — every proposal is re-checked by the policy engine
 * (lib/policy/policyEngine.ts) before anything executes.
 */
export const ActionTypeSchema = z.enum([
  "CREATE_PLAN",
  "MODIFY_PLAN",
  "SCHEDULE_CHECKIN",
  "CREATE_MEMORY",
  "UPDATE_MEMORY",
  "DELETE_MEMORY",
  "RECORD_EVENT",
  "SEND_EXTERNAL_MESSAGE",
  "HIGH_RISK_HEALTH_ACTION",
]);

export const RiskLevelSchema = z.enum(["low", "medium", "high", "prohibited"]);

export const ActionProposalSchema = z.object({
  actionType: ActionTypeSchema,
  parameters: z.record(z.string(), z.unknown()),
  reason: z.string().describe("One or two sentences a user could read as-is."),
  riskLevel: RiskLevelSchema,
  requiresApproval: z.boolean(),
});
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
