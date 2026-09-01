import { ai, getGeminiModel } from "../genkit";
import { AgentDecisionSchema, type AgentDecision, type IntentClassification } from "../schemas/agentSchemas";
import { buildContextBlock, type AgentContext } from "./context";
import { SYSTEM_PROMPT } from "./prompts";
import { findToolByActionType } from "../tools/registry";

export interface DecisionRequest {
  message: string;
  context: AgentContext;
  intent: IntentClassification;
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

const INTENT_GUIDANCE: Record<IntentClassification["intent"], string> = {
  simple_query: "This looks like a direct question answerable from the context above. Answer it plainly with proposedAction: null.",
  improve_adherence:
    "The user is describing difficulty staying consistent. Look for a meaningful difference in the evidence (e.g. completion by session duration) before proposing anything — if the evidence doesn't clearly favor a change, it's fine to propose scheduling a check-in instead, or ask a clarifying question.",
  general_request: "Respond helpfully using the context above. Only propose an action if one is clearly warranted.",
  unclear: "Ask a clarifying question instead of guessing — set proposedAction to null.",
};

/**
 * REASON + PLAN + VALIDATE (§17/§22) in a single structured Gemini call
 * (§35 — one call, not several, even across intents). Nothing returned
 * here is trusted for execution yet: a proposed action's parameters are
 * checked against its tool schema before decisionEngine hands the
 * decision back, and the policy engine (lib/policy/policyEngine.ts) makes
 * the real allow/approve call downstream regardless of what the model set.
 */
export async function decide(request: DecisionRequest): Promise<AgentDecision> {
  const prompt = [
    buildContextBlock(request.context),
    "",
    `CLASSIFIED INTENT: ${request.intent.intent} — ${INTENT_GUIDANCE[request.intent.intent]}`,
    "",
    `USER MESSAGE: ${request.message}`,
  ].join("\n");

  let decision: AgentDecision;
  try {
    const response = await ai.generate({
      model: getGeminiModel(),
      system: SYSTEM_PROMPT,
      prompt,
      output: { schema: AgentDecisionSchema },
    });
    if (!response.output) {
      return fallbackDecision("I had trouble forming a response — could you rephrase that?");
    }
    decision = response.output;
  } catch (err) {
    console.error("Gemini decision call failed", err);
    return fallbackDecision("I'm having trouble reaching my reasoning engine right now — could you try again in a moment?");
  }

  if (decision.proposedAction) {
    const tool = findToolByActionType(decision.proposedAction.actionType);
    const parsed = tool?.inputSchema.safeParse(decision.proposedAction.parameters);
    if (!tool || !parsed?.success) {
      return {
        ...decision,
        proposedAction: null,
        requiresApproval: false,
        clarifyingQuestion:
          decision.clarifyingQuestion ?? "I had an idea but couldn't structure it cleanly — could you clarify what you'd like changed?",
      };
    }
  }

  return decision;
}
