import type { AgentDecision, IntentClassification } from "../schemas/agentSchemas";
import type { AgentContext } from "./context";
import { decide } from "./decisionEngine";

/**
 * The Gemini-backed half of the pipeline in §17/§22
 * (RECEIVE → CLASSIFY → RETRIEVE_CONTEXT → REASON → PLAN → VALIDATE).
 * Context (context.ts) and intent classification (planner.ts) are built
 * once by lib/agent/agentService.ts and shared across both providers, so
 * this stays a thin, easily-traced entry point onto decisionEngine.ts —
 * the part of the pipeline that is actually specific to calling Gemini.
 */
export async function runContinuumAgentFlow(
  message: string,
  context: AgentContext,
  intent: IntentClassification
): Promise<AgentDecision> {
  return decide({ message, context, intent });
}
