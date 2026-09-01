import type { ConversationMessage } from "@/lib/types";
import { ai, getGeminiModel } from "../genkit";
import { AgentDecisionSchema, type AgentDecision, type IntentClassification } from "../schemas/agentSchemas";
import { buildContextBlock, type AgentContext } from "./context";
import { SYSTEM_PROMPT } from "./prompts";
import { describeToolCatalog, findToolByActionType } from "../tools/registry";

export interface DecisionRequest {
  message: string;
  history: ConversationMessage[];
  context: AgentContext;
  intent: IntentClassification;
}

const MAX_HISTORY_TURNS = 12;

function renderHistory(history: ConversationMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  if (recent.length === 0) return "CONVERSATION SO FAR: (this is the first message)";
  const lines = recent.map((m) => `${m.role === "user" ? "User" : "Continuum"}: ${m.content}`);
  return ["CONVERSATION SO FAR:", ...lines].join("\n");
}

function fallbackDecision(clarifyingQuestion: string): AgentDecision {
  return {
    intent: "unclear",
    confidence: 0,
    summary: "I wasn't able to form a clear recommendation from that.",
    evidenceIds: [],
    nextStep: "Ask a clarifying question.",
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion,
    memoryCandidates: [],
  };
}

/** Gemini's free tier throws transient 503 (UNAVAILABLE) / 429 under load — retry a few times before falling back. */
function isTransient(err: unknown): boolean {
  const code = (err as { code?: number; status?: string })?.code;
  const status = (err as { status?: string })?.status;
  return code === 503 || code === 429 || status === "UNAVAILABLE" || status === "RESOURCE_EXHAUSTED";
}

async function generateWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
}

const INTENT_GUIDANCE: Record<IntentClassification["intent"], string> = {
  simple_query: "This looks like a direct question answerable from the context above. Answer it plainly with proposedAction: null.",
  improve_adherence:
    "The user wants help being consistent, or wants a routine set up. If there is NO active plan and the conversation already gives a goal plus a schedule (days and time), propose CREATE_PLAN now — do not keep asking. If there IS an active plan, look for a meaningful difference in the evidence before proposing MODIFY_PLAN; if the evidence doesn't clearly favor a change, propose a check-in or ask at most one clarifying question.",
  general_request:
    "Respond helpfully using the context above. If the conversation gives enough to act (e.g. a routine to create), propose the action rather than asking another question.",
  unclear: "Ask a clarifying question instead of guessing — set proposedAction to null.",
};

/** After ~2 rounds of clarification the model should commit to a proposal rather than ask again. */
function clarificationRounds(history: ConversationMessage[]): number {
  return history.filter((m) => m.role === "agent" && m.content.trim().endsWith("?")).length;
}

/**
 * REASON + PLAN + VALIDATE (§17/§22) in a single structured Gemini call
 * (§35 — one call, not several, even across intents). Nothing returned
 * here is trusted for execution yet: a proposed action's parameters are
 * checked against its tool schema before decisionEngine hands the
 * decision back, and the policy engine (lib/policy/policyEngine.ts) makes
 * the real allow/approve call downstream regardless of what the model set.
 */
export async function decide(request: DecisionRequest): Promise<AgentDecision> {
  const rounds = clarificationRounds(request.history);
  const basePrompt = [
    buildContextBlock(request.context),
    "",
    renderHistory(request.history),
    "",
    "ACTIONS YOU CAN PROPOSE (set proposedAction.actionType and fill proposedAction.parameters exactly):",
    describeToolCatalog(),
    "",
    "Treat the user's statements in CONVERSATION SO FAR as authoritative: if they gave a time, days, duration, or goal there, use those values and do not ask again or call them a conflict with a stored preference.",
    rounds >= 2
      ? "You have already asked several questions in this thread — commit to a concrete proposedAction now unless something essential is genuinely still missing."
      : "",
    `CLASSIFIED INTENT: ${request.intent.intent} — ${INTENT_GUIDANCE[request.intent.intent]}`,
    "",
    `USER MESSAGE: ${request.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const generate = (prompt: string) =>
    generateWithRetry(() =>
      ai.generate({ model: getGeminiModel(), system: SYSTEM_PROMPT, prompt, output: { schema: AgentDecisionSchema } })
    );

  // Returns null if valid (mutating parameters to the parsed form), or a
  // human-readable description of what's wrong with the proposed action.
  function validateProposal(d: AgentDecision): string | null {
    if (!d.proposedAction) return null;
    const tool = findToolByActionType(d.proposedAction.actionType);
    if (!tool) return `"${d.proposedAction.actionType}" is not a valid action type.`;
    const parsed = tool.inputSchema.safeParse(d.proposedAction.parameters);
    if (!parsed.success) {
      return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    }
    d.proposedAction.parameters = parsed.data as Record<string, unknown>;
    return null;
  }

  let decision: AgentDecision;
  try {
    const response = await generate(basePrompt);
    if (!response.output) return fallbackDecision("I had trouble forming a response — could you rephrase that?");
    decision = response.output;

    // One repair round: if the proposal doesn't satisfy the tool schema, tell
    // the model exactly what was wrong and let it try again.
    const problem = validateProposal(decision);
    if (problem && decision.proposedAction) {
      const retry = await generate(
        `${basePrompt}\n\nYOUR PREVIOUS proposedAction FOR ${decision.proposedAction.actionType} WAS REJECTED: ${problem}\n` +
          "Re-answer with a valid proposedAction that fills every required parameter, or set proposedAction to null and ask one specific question."
      );
      if (retry.output) decision = retry.output;
    }
  } catch (err) {
    console.error("Gemini decision call failed", err);
    return fallbackDecision("I'm having trouble reaching my reasoning engine right now — could you try again in a moment?");
  }

  // Final guard: if a proposed action still doesn't validate, drop it but keep a useful question.
  if (validateProposal(decision) && decision.proposedAction) {
    return {
      ...decision,
      proposedAction: null,
      requiresApproval: false,
      clarifyingQuestion:
        decision.clarifyingQuestion ??
        "I have most of what I need but not quite enough to set this up cleanly — could you restate the goal, days, and time in one line?",
    };
  }

  return decision;
}
