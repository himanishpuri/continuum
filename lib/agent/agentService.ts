import { getRepositories } from "@/lib/repositories";
import { buildAgentContext } from "@/src/ai/agent/context";
import { classifyIntent } from "@/src/ai/agent/planner";
import { selectMemoriesToPersist } from "@/src/ai/agent/verifier";
import { containsSafetyTrigger, SAFETY_RESPONSE } from "@/src/ai/agent/prompts";
import { findEvidence } from "@/lib/evidence/evidenceEngine";
import { proposeAction } from "@/lib/tools/actionService";
import { recordMemoryUsage } from "@/lib/memory/memoryService";
import { GeminiAgentProvider } from "./geminiAgentProvider";
import { DemoAgentProvider } from "./demoAgentProvider";
import type { AgentProvider } from "./agentProvider";
import type { ActionType, AgentAction, AgentRunStep, ConversationMessage, ConversationMessageCard } from "@/lib/types";

export interface AgentMessageResult {
  conversationId: string;
  runId: string;
  message: ConversationMessage;
  pendingApproval: { actionId: string } | null;
  steps: AgentRunStep[];
}

let cachedProvider: AgentProvider | null = null;

/** §46/§47: Gemini only when a key is configured and DEMO_MODE is off; otherwise the deterministic demo provider. */
export function getAgentProvider(): AgentProvider {
  if (cachedProvider) return cachedProvider;
  const useGemini = process.env.DEMO_MODE !== "true" && Boolean(process.env.GEMINI_API_KEY);
  cachedProvider = useGemini ? new GeminiAgentProvider() : new DemoAgentProvider();
  return cachedProvider;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function humanizeActionType(type: ActionType): string {
  return type.toLowerCase().replace(/_/g, " ");
}

function planProposalFields(parameters: Record<string, unknown>): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];
  if (typeof parameters.durationMinutes === "number") {
    fields.push({ label: "Duration", value: `${parameters.durationMinutes} minutes` });
  }
  if (Array.isArray(parameters.daysOfWeek)) {
    fields.push({ label: "Days", value: (parameters.daysOfWeek as number[]).map((d) => DAY_LABELS[d]).join(", ") });
  }
  if (typeof parameters.time === "string") fields.push({ label: "Time", value: parameters.time as string });
  if (typeof parameters.scheduledAt === "string") fields.push({ label: "Scheduled for", value: new Date(parameters.scheduledAt as string).toLocaleString() });
  if (typeof parameters.message === "string") fields.push({ label: "Message", value: parameters.message as string });
  return fields;
}

function buildActionCard(action: AgentAction): ConversationMessageCard {
  const isPlan = action.type === "CREATE_PLAN" || action.type === "MODIFY_PLAN";
  return {
    kind: isPlan ? "plan_proposal" : "action_approval",
    data: {
      actionId: action.id,
      actionType: action.type,
      status: action.status,
      title: action.type === "MODIFY_PLAN" ? "Updated routine" : action.type === "CREATE_PLAN" ? "New routine" : humanizeActionType(action.type),
      fields: planProposalFields(action.parameters),
      reason: action.reason,
      riskLevel: action.riskLevel,
    },
  };
}

/**
 * The single entry point for a user chat turn (§17/§22 RECEIVE → ... →
 * RESPOND). Builds context once, classifies intent, delegates to whichever
 * AgentProvider is active for the decision, then handles everything the
 * decision implies — proposing/executing actions through the policy gate,
 * filtering and persisting memory candidates, and writing the AgentRun +
 * conversation messages that make the run inspectable afterward.
 */
export async function sendAgentMessage(userId: string, message: string, conversationId?: string): Promise<AgentMessageResult> {
  const repos = getRepositories();
  const startedAt = new Date().toISOString();

  const conversation = conversationId
    ? await repos.conversations.get(userId, conversationId)
    : await repos.conversations.create(userId, { title: message.slice(0, 60), createdAt: startedAt, updatedAt: startedAt });
  if (!conversation) throw new Error("Conversation not found.");

  await repos.conversations.addMessage(userId, conversation.id, {
    role: "user",
    content: message,
    cards: [],
    createdAt: startedAt,
    metadata: {},
  });

  const provider = getAgentProvider();
  const run = await repos.agentRuns.create(userId, {
    conversationId: conversation.id,
    trigger: "user_message",
    input: message,
    status: "running",
    provider: provider.name,
    steps: [],
    planSummary: null,
    actions: [],
    resultSummary: "",
    error: null,
    startedAt,
    completedAt: null,
  });

  await repos.events.create(userId, {
    type: "AGENT_STARTED",
    timestamp: startedAt,
    source: "user",
    payload: { runId: run.id, trigger: "user_message" },
    summary: "Continuum started processing a new message.",
  });

  if (containsSafetyTrigger(message)) {
    const steps: AgentRunStep[] = [{ label: "Detected a safety-sensitive message", completedAt: new Date().toISOString() }];
    const agentMessage = await repos.conversations.addMessage(userId, conversation.id, {
      role: "agent",
      content: SAFETY_RESPONSE,
      cards: [],
      createdAt: new Date().toISOString(),
      metadata: { runId: run.id },
    });
    await repos.agentRuns.update(userId, run.id, {
      status: "completed",
      steps,
      resultSummary: SAFETY_RESPONSE,
      completedAt: new Date().toISOString(),
    });
    return { conversationId: conversation.id, runId: run.id, message: agentMessage, pendingApproval: null, steps };
  }

  try {
    const context = await buildAgentContext(userId);
    const intent = classifyIntent(message);
    const turn = await provider.handleMessage({ userId, message, context, intent });
    const decision = turn.decision;

    const steps: AgentRunStep[] = [
      ...context.retrievedSteps.map((label) => ({ label, completedAt: new Date().toISOString() })),
      ...turn.steps.map((label) => ({ label, completedAt: new Date().toISOString() })),
    ];

    let actionRecord: AgentAction | null = null;
    let denialReason: string | null = null;
    if (decision.proposedAction) {
      steps.push({ label: "Checked available actions", completedAt: new Date().toISOString() });
      const outcome = await proposeAction(userId, {
        proposal: decision.proposedAction,
        evidenceIds: decision.evidenceIds,
        permissions: context.user.settings.permissions,
        autonomyLevel: context.user.settings.autonomyLevel,
      });
      if (!outcome.allowed) denialReason = outcome.reason;
      else actionRecord = outcome.action;
    }

    const memoriesToPersist = selectMemoriesToPersist(decision.memoryCandidates, context.memories);
    for (const candidate of memoriesToPersist) {
      await proposeAction(userId, {
        proposal: {
          actionType: "CREATE_MEMORY",
          parameters: {
            type: candidate.type,
            content: candidate.content,
            confidence: candidate.confidence,
            expiresInDays: candidate.expiresInDays,
          },
          reason: "Inferred from conversation.",
          riskLevel: "low",
          requiresApproval: false,
        },
        evidenceIds: decision.evidenceIds,
        permissions: context.user.settings.permissions,
        autonomyLevel: context.user.settings.autonomyLevel,
      });
    }
    if (context.memories.length > 0) {
      await recordMemoryUsage(userId, context.memories.map((m) => m.id));
    }

    steps.push({ label: decision.proposedAction ? "Recommendation ready" : "Response ready", completedAt: new Date().toISOString() });

    const responseParts = [decision.summary];
    if (denialReason) responseParts.push(`(I can't do this automatically: ${denialReason})`);
    if (decision.clarifyingQuestion) responseParts.push(decision.clarifyingQuestion);
    const responseText = responseParts.join("\n\n");

    const cards: ConversationMessageCard[] = [];
    if (actionRecord && actionRecord.status === "PENDING_APPROVAL") cards.push(buildActionCard(actionRecord));
    const evidence = findEvidence(context.evidence, decision.evidenceIds);
    if (evidence.length > 0) cards.push({ kind: "evidence", data: { items: evidence } });

    const agentMessage = await repos.conversations.addMessage(userId, conversation.id, {
      role: "agent",
      content: responseText,
      cards,
      createdAt: new Date().toISOString(),
      metadata: { runId: run.id, evidenceIds: decision.evidenceIds },
    });
    await repos.conversations.update(userId, conversation.id, { updatedAt: new Date().toISOString() });

    await repos.agentRuns.update(userId, run.id, {
      status: "completed",
      steps,
      planSummary: decision.proposedAction ? decision.summary : null,
      actions: actionRecord ? [{ actionId: actionRecord.id, type: actionRecord.type, status: actionRecord.status }] : [],
      resultSummary: responseText,
      completedAt: new Date().toISOString(),
    });

    await repos.events.create(userId, {
      type: "AGENT_COMPLETED",
      timestamp: new Date().toISOString(),
      source: "agent",
      payload: { runId: run.id },
      summary: "Continuum finished processing the message.",
    });

    return {
      conversationId: conversation.id,
      runId: run.id,
      message: agentMessage,
      pendingApproval: actionRecord && actionRecord.status === "PENDING_APPROVAL" ? { actionId: actionRecord.id } : null,
      steps,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallbackText = "I couldn't complete that just now. Nothing was changed — please try again.";
    const agentMessage = await repos.conversations.addMessage(userId, conversation.id, {
      role: "agent",
      content: fallbackText,
      cards: [],
      createdAt: new Date().toISOString(),
      metadata: { runId: run.id },
    });
    await repos.agentRuns.update(userId, run.id, {
      status: "failed",
      error: errorMessage,
      resultSummary: fallbackText,
      completedAt: new Date().toISOString(),
    });
    await repos.events.create(userId, {
      type: "AGENT_FAILED",
      timestamp: new Date().toISOString(),
      source: "agent",
      payload: { runId: run.id, error: errorMessage },
      summary: "Continuum failed to process the message.",
    });
    return {
      conversationId: conversation.id,
      runId: run.id,
      message: agentMessage,
      pendingApproval: null,
      steps: [{ label: "Something went wrong", completedAt: new Date().toISOString() }],
    };
  }
}
