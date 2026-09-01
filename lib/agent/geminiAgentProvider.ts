import { runContinuumAgentFlow } from "@/src/ai/agent/agentFlow";
import type { AgentProvider, AgentTurnInput, AgentTurnResult } from "./agentProvider";

export class GeminiAgentProvider implements AgentProvider {
  readonly name = "gemini" as const;

  async handleMessage(input: AgentTurnInput): Promise<AgentTurnResult> {
    const decision = await runContinuumAgentFlow(input.message, input.history, input.context, input.intent);
    return {
      decision,
      steps: ["Reasoned about your request with Gemini", "Prepared a recommendation"],
    };
  }
}
