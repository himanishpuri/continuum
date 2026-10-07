import { decide } from "@/src/ai/agent/decisionEngine";
import type { AgentProvider, AgentTurnInput, AgentTurnResult } from "./agentProvider";

/** Context and intent are built once in agentService and shared by both providers. */
export class GeminiAgentProvider implements AgentProvider {
  readonly name = "gemini" as const;

  async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
    const { decision, meta } = await decide({ userId: input.userId, message: input.message, history: input.history, context: input.context, intent: input.intent });
    return {
      decision,
      meta,
      steps: ["Reasoned about your request with Gemini", "Prepared a recommendation"],
    };
  }
}
