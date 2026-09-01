import type { AgentContext } from "@/src/ai/agent/context";
import type { AgentDecision, IntentClassification } from "@/src/ai/schemas/agentSchemas";
import type { ConversationMessage } from "@/lib/types";

export interface AgentTurnInput {
  userId: string;
  message: string;
  /** Prior turns in this conversation, oldest first, excluding the current message. */
  history: ConversationMessage[];
  context: AgentContext;
  intent: IntentClassification;
}

export interface AgentTurnResult {
  decision: AgentDecision;
  /** Extra human-readable step labels beyond context retrieval, shown in the Agent Run UI (§9). */
  steps: string[];
}

/**
 * §46/§47: the seam between the UI-facing AgentService and the actual
 * reasoning engine. GeminiAgentProvider calls Gemini through Genkit;
 * DemoAgentProvider reproduces the same behavior deterministically using
 * the same progress/evidence/policy engines, so the two are interchangeable
 * from AgentService's point of view.
 */
export interface AgentProvider {
  readonly name: "gemini" | "demo";
  handleMessage(input: AgentTurnInput): Promise<AgentTurnResult>;
}
