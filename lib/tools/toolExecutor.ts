import { getRepositories } from "@/lib/repositories";
import { getCalendarService } from "@/lib/external/calendarService";
import { getNotificationService } from "@/lib/external/notificationService";
import * as memoryService from "@/lib/memory/memoryService";
import { resolveSessionTimestamp } from "@/lib/util/sessionTimestamp";
import type { AgentAction, EventType, MemoryType, Plan, PlanVersionChange } from "@/lib/types";

interface ExecutionResult {
  /** Persisted on the AgentAction.result field. */
  result: Record<string, unknown>;
  eventType: EventType;
  eventSummary: string;
  /** Persisted on the audit EventRecord.payload; defaults to `result` when omitted. */
  eventPayload?: Record<string, unknown>;
  eventTimestamp?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function frequencyLabelFromDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join(",") === "1,2,3,4,5") return "Mon-Fri";
  if (sorted.join(",") === "0,1,2,3,4,5,6") return "Every day";
  return sorted.map((d) => DAY_LABELS[d]).join(", ");
}

function stripId<T extends { id: string }>(record: T): Omit<T, "id"> {
  const { id: _id, ...rest } = record;
  return rest;
}

/**
 * Runs the deterministic side effect for one already-approved action. This
 * is the only code path in the app that mutates plans, memories, or
 * check-ins — the model never touches storage directly (§71).
 */
export async function executeAction(userId: string, actionId: string): Promise<AgentAction> {
  const repos = getRepositories();
  let action = await repos.actions.get(userId, actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);

  if (action.status === "COMPLETED") return action; // idempotent retry

  const priorCompletion = await repos.actions.findByIdempotencyKey(userId, action.idempotencyKey);
  if (priorCompletion && priorCompletion.status === "COMPLETED") {
    return priorCompletion; // another action already fulfilled this idempotency key
  }

  if (action.status !== "APPROVED") {
    throw new Error(`Action ${actionId} is not approved (status=${action.status}).`);
  }

  action = await repos.actions.update(userId, actionId, { status: "EXECUTING" });

  try {
    const outcome = await runExecutor(userId, action);
    action = await repos.actions.update(userId, actionId, {
      status: "COMPLETED",
      executedAt: new Date().toISOString(),
      result: outcome.result,
    });
    await repos.events.create(userId, {
      type: outcome.eventType,
      timestamp: outcome.eventTimestamp ?? new Date().toISOString(),
      source: "agent",
      payload: { actionId: action.id, actionType: action.type, ...(outcome.eventPayload ?? outcome.result) },
      summary: outcome.eventSummary,
    });
    return action;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    action = await repos.actions.update(userId, actionId, { status: "FAILED", error: message });
    await repos.events.create(userId, {
      type: "AGENT_FAILED",
      timestamp: new Date().toISOString(),
      source: "agent",
      payload: { actionId: action.id, actionType: action.type, error: message },
      summary: `Action failed: ${message}`,
    });
    return action;
  }
}

async function runExecutor(userId: string, action: AgentAction): Promise<ExecutionResult> {
  switch (action.type) {
    case "CREATE_PLAN":
      return executeCreatePlan(userId, action);
    case "MODIFY_PLAN":
      return executeModifyPlan(userId, action);
    case "SCHEDULE_CHECKIN":
      return executeScheduleCheckin(userId, action);
    case "CREATE_MEMORY":
      return executeCreateMemory(userId, action);
    case "UPDATE_MEMORY":
      return executeUpdateMemory(userId, action);
    case "DELETE_MEMORY":
      return executeDeleteMemory(userId, action);
    case "RECORD_EVENT":
      return executeRecordEvent(userId, action);
    case "SEND_EXTERNAL_MESSAGE":
      return executeSendExternalMessage(userId, action);
    case "HIGH_RISK_HEALTH_ACTION":
      throw new Error("HIGH_RISK_HEALTH_ACTION can never execute — this indicates a policy bypass bug.");
  }
}

interface PlanMutationParams {
  planId?: string;
  title?: string;
  goal?: string;
  description?: string;
  durationMinutes?: number;
  daysOfWeek?: number[];
  time?: string;
  frequencyLabel?: string;
  successMetrics?: string[];
  checkinFrequencyDays?: number;
  reason?: string;
}

async function executeCreatePlan(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as PlanMutationParams;
  if (!p.durationMinutes) throw new Error("CREATE_PLAN requires durationMinutes.");
  const now = new Date().toISOString();
  const daysOfWeek = p.daysOfWeek ?? [1, 2, 3, 4, 5];

  const plan = await getRepositories().plans.create(userId, {
    title: p.title ?? "Evening Recovery Routine",
    goal: p.goal ?? "Improve consistency",
    description: p.description ?? "",
    schedule: { daysOfWeek, time: p.time ?? "19:00" },
    durationMinutes: p.durationMinutes,
    frequencyLabel: p.frequencyLabel ?? frequencyLabelFromDays(daysOfWeek),
    status: "active",
    version: 1,
    successMetrics: p.successMetrics ?? ["Increase weekly completion rate"],
    checkinFrequencyDays: p.checkinFrequencyDays ?? 7,
    createdAt: now,
    updatedAt: now,
  });

  await getRepositories().planVersions.create(userId, {
    planId: plan.id,
    version: 1,
    snapshot: stripId(plan),
    changes: [],
    reason: p.reason ?? "Initial plan created.",
    evidenceIds: action.evidenceIds,
    createdAt: now,
    createdBy: "agent",
  });

  return {
    result: { planId: plan.id, version: plan.version },
    eventType: "PLAN_CREATED",
    eventSummary: `Created plan "${plan.title}" — ${plan.durationMinutes} min, ${plan.frequencyLabel}.`,
  };
}

async function executeModifyPlan(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as PlanMutationParams;
  const repos = getRepositories();
  const existing = p.planId ? await repos.plans.get(userId, p.planId) : await repos.plans.getActive(userId);
  if (!existing) throw new Error("No active plan to modify.");

  const patch: Partial<Plan> = {};
  const changes: PlanVersionChange[] = [];

  if (p.durationMinutes !== undefined && p.durationMinutes !== existing.durationMinutes) {
    changes.push({ field: "durationMinutes", from: existing.durationMinutes, to: p.durationMinutes });
    patch.durationMinutes = p.durationMinutes;
  }
  if (p.daysOfWeek !== undefined && p.daysOfWeek.join(",") !== existing.schedule.daysOfWeek.join(",")) {
    const newLabel = p.frequencyLabel ?? frequencyLabelFromDays(p.daysOfWeek);
    changes.push({ field: "schedule.daysOfWeek", from: existing.schedule.daysOfWeek, to: p.daysOfWeek });
    changes.push({ field: "frequencyLabel", from: existing.frequencyLabel, to: newLabel });
    patch.schedule = { ...existing.schedule, daysOfWeek: p.daysOfWeek };
    patch.frequencyLabel = newLabel;
  }
  if (p.time !== undefined && p.time !== existing.schedule.time) {
    changes.push({ field: "schedule.time", from: existing.schedule.time, to: p.time });
    patch.schedule = { ...(patch.schedule ?? existing.schedule), time: p.time };
  }
  if (p.title !== undefined && p.title !== existing.title) {
    changes.push({ field: "title", from: existing.title, to: p.title });
    patch.title = p.title;
  }
  if (p.goal !== undefined && p.goal !== existing.goal) {
    changes.push({ field: "goal", from: existing.goal, to: p.goal });
    patch.goal = p.goal;
  }

  if (changes.length === 0) {
    return {
      result: { planId: existing.id, version: existing.version, noop: true },
      eventType: "PLAN_UPDATED",
      eventSummary: "Reviewed the plan; no changes were necessary.",
    };
  }

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;
  const updated = await repos.plans.update(userId, existing.id, { ...patch, version: newVersion, updatedAt: now });

  await repos.planVersions.create(userId, {
    planId: existing.id,
    version: newVersion,
    snapshot: stripId(updated),
    changes,
    reason: p.reason ?? "Updated based on recent adherence.",
    evidenceIds: action.evidenceIds,
    createdAt: now,
    createdBy: "agent",
  });

  return {
    result: { planId: updated.id, version: updated.version, changes },
    eventType: "PLAN_UPDATED",
    eventSummary: `Updated plan to v${updated.version} (${changes.map((c) => c.field).join(", ")}).`,
  };
}

async function executeScheduleCheckin(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as { scheduledAt: string; message: string; planId?: string | null };
  if (!p.scheduledAt || !p.message) throw new Error("SCHEDULE_CHECKIN requires scheduledAt and message.");

  // Don't stack check-ins: if this plan already has a pending check-in scheduled
  // for now or later, keep it and no-op. "Future pending" excludes the one the
  // background job is currently processing (its scheduledAt is in the past).
  const nowIso = new Date().toISOString();
  const existing = (await getRepositories().checkins.list(userId)).find(
    (c) => c.status === "pending" && (c.planId ?? null) === (p.planId ?? null) && c.scheduledAt >= nowIso
  );
  if (existing) {
    return {
      result: { checkinId: existing.id, scheduledAt: existing.scheduledAt, skipped: true },
      eventType: "CHECKIN_SCHEDULED",
      eventSummary: "A check-in is already scheduled — not adding another.",
    };
  }

  const checkin = await getRepositories().checkins.create(userId, {
    planId: p.planId ?? null,
    scheduledAt: p.scheduledAt,
    completedAt: null,
    status: "pending",
    message: p.message,
    response: null,
    createdBy: "agent",
    createdAt: new Date().toISOString(),
  });

  await getCalendarService().scheduleEvent({ userId, title: "Continuum check-in", startsAt: p.scheduledAt });

  return {
    result: { checkinId: checkin.id, scheduledAt: checkin.scheduledAt },
    eventType: "CHECKIN_SCHEDULED",
    eventSummary: `Scheduled a check-in for ${checkin.scheduledAt}.`,
  };
}

async function executeCreateMemory(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as { type: MemoryType; content: string; confidence?: number; expiresInDays?: number | null };
  if (!p.type || !p.content) throw new Error("CREATE_MEMORY requires type and content.");
  const memory = await memoryService.createMemory(userId, {
    type: p.type,
    content: p.content,
    confidence: p.confidence ?? 0.7,
    source: "inferred",
    expiresInDays: p.expiresInDays ?? null,
  });
  return {
    result: { memoryId: memory.id },
    eventType: "MEMORY_CREATED",
    eventSummary: `Remembered: "${memory.content}"`,
  };
}

async function executeUpdateMemory(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as { memoryId: string; content?: string; confidence?: number };
  if (!p.memoryId) throw new Error("UPDATE_MEMORY requires memoryId.");
  const memory = await memoryService.updateMemory(userId, p.memoryId, { content: p.content, confidence: p.confidence });
  return {
    result: { memoryId: memory.id },
    eventType: "MEMORY_UPDATED",
    eventSummary: `Updated memory: "${memory.content}"`,
  };
}

async function executeDeleteMemory(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as { memoryId: string };
  if (!p.memoryId) throw new Error("DELETE_MEMORY requires memoryId.");
  await memoryService.deleteMemory(userId, p.memoryId);
  return {
    result: { memoryId: p.memoryId },
    eventType: "MEMORY_DELETED",
    eventSummary: "Deleted a memory at the agent's suggestion.",
  };
}

async function executeRecordEvent(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as {
    eventType: "SESSION_COMPLETED" | "SESSION_MISSED";
    durationMinutes?: number;
    timestamp?: string;
    summary: string;
  };
  if (!p.eventType || !p.summary) throw new Error("RECORD_EVENT requires eventType and summary.");
  const timestamp = resolveSessionTimestamp(p.timestamp);
  return {
    result: { recordedType: p.eventType, timestamp },
    eventType: p.eventType,
    eventSummary: p.summary,
    eventPayload: { durationMinutes: p.durationMinutes ?? null, reportedVia: "agent" },
    eventTimestamp: timestamp,
  };
}

async function executeSendExternalMessage(userId: string, action: AgentAction): Promise<ExecutionResult> {
  const p = action.parameters as { message: string; channel?: "email" | "sms" | "push" };
  if (!p.message) throw new Error("SEND_EXTERNAL_MESSAGE requires a message.");
  const sent = await getNotificationService().send({ userId, message: p.message, channel: p.channel ?? "push" });
  return {
    result: { notificationId: sent.id, delivered: sent.delivered },
    eventType: "MESSAGE_SENT",
    eventSummary: `Sent a message: "${p.message}"`,
  };
}
