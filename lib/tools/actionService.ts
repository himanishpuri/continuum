import { randomUUID } from "node:crypto";
import { getRepositories } from "@/lib/repositories";
import { evaluatePolicy } from "@/lib/policy/policyEngine";
import { executeAction } from "./toolExecutor";
import type { ActionProposal } from "@/src/ai/schemas/actionSchemas";
import type { AgentAction, AgentPermissions, AutonomyLevel } from "@/lib/types";

export interface ProposeActionInput {
  proposal: ActionProposal;
  evidenceIds: string[];
  permissions: AgentPermissions;
  autonomyLevel: AutonomyLevel;
  idempotencyKey?: string;
}

export interface ProposeActionOutcome {
  allowed: boolean;
  reason: string;
  action: AgentAction | null;
}

const ACTION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

/**
 * The policy gate from §71: the model's proposal is never trusted as-is.
 * `evaluatePolicy` decides allowed/requiresApproval deterministically; if
 * allowed and no approval is required the action executes immediately,
 * otherwise it's persisted as PENDING_APPROVAL for the user to act on
 * later via approveAction/rejectAction.
 */
export async function proposeAction(userId: string, input: ProposeActionInput): Promise<ProposeActionOutcome> {
  const decision = evaluatePolicy({
    actionType: input.proposal.actionType,
    permissions: input.permissions,
    autonomyLevel: input.autonomyLevel,
  });

  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, action: null };
  }

  const repos = getRepositories();
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const existing = await repos.actions.findByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    return { allowed: true, reason: decision.reason, action: existing };
  }

  const now = new Date().toISOString();
  let action = await repos.actions.create(userId, {
    type: input.proposal.actionType,
    parameters: input.proposal.parameters,
    reason: input.proposal.reason,
    evidenceIds: input.evidenceIds,
    riskLevel: decision.riskLevel,
    status: decision.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
    approvalRequired: decision.requiresApproval,
    approvedAt: decision.requiresApproval ? null : now,
    rejectedAt: null,
    executedAt: null,
    idempotencyKey,
    result: null,
    error: null,
    createdAt: now,
    expiresAt: new Date(Date.now() + ACTION_EXPIRY_MS).toISOString(),
  });

  if (decision.requiresApproval) {
    await repos.events.create(userId, {
      type: action.type === "CREATE_PLAN" || action.type === "MODIFY_PLAN" ? "PLAN_PROPOSED" : "APPROVAL_REQUESTED",
      timestamp: now,
      source: "agent",
      payload: { actionId: action.id, actionType: action.type },
      summary: `Continuum proposed: ${input.proposal.reason}`,
    });
  } else {
    action = await executeAction(userId, action.id);
  }

  return { allowed: true, reason: decision.reason, action };
}

async function requirePendingAction(userId: string, actionId: string): Promise<AgentAction> {
  const repos = getRepositories();
  const action = await repos.actions.get(userId, actionId);
  if (!action) throw new Error("Action not found.");
  if (action.status === "PENDING_APPROVAL" && new Date(action.expiresAt).getTime() < Date.now()) {
    await repos.actions.update(userId, actionId, { status: "EXPIRED" });
    throw new Error("This proposal has expired. Ask the agent to propose it again.");
  }
  return action;
}

export async function approveAction(userId: string, actionId: string): Promise<AgentAction> {
  const repos = getRepositories();
  const action = await requirePendingAction(userId, actionId);
  if (action.status === "COMPLETED") return action; // idempotent
  if (action.status !== "PENDING_APPROVAL") {
    throw new Error(`Action cannot be approved from status ${action.status}.`);
  }
  await repos.actions.update(userId, actionId, { status: "APPROVED", approvedAt: new Date().toISOString() });
  await repos.events.create(userId, {
    type: "ACTION_APPROVED",
    timestamp: new Date().toISOString(),
    source: "user",
    payload: { actionId: action.id, actionType: action.type },
    summary: `Approved: ${action.reason}`,
  });
  return executeAction(userId, actionId);
}

export async function rejectAction(userId: string, actionId: string): Promise<AgentAction> {
  const repos = getRepositories();
  const action = await requirePendingAction(userId, actionId);
  if (action.status !== "PENDING_APPROVAL") {
    throw new Error(`Action cannot be rejected from status ${action.status}.`);
  }
  const rejected = await repos.actions.update(userId, actionId, { status: "REJECTED", rejectedAt: new Date().toISOString() });
  await repos.events.create(userId, {
    type: "ACTION_REJECTED",
    timestamp: new Date().toISOString(),
    source: "user",
    payload: { actionId: action.id, actionType: action.type },
    summary: `Rejected: ${action.reason}`,
  });
  return rejected;
}
