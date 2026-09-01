import { z } from "genkit";
import { ActionProposalSchema } from "./actionSchemas";
import { MemoryCandidateSchema } from "./memorySchemas";

/**
 * Planner output (§17 PLANNER PROMPT): a cheap classification pass that
 * decides whether a message needs the full reasoning pipeline at all.
 */
export const IntentClassificationSchema = z.object({
  intent: z
    .enum(["simple_query", "improve_adherence", "general_request", "unclear"])
    .describe("simple_query = answerable straight from context, no proposal needed"),
  goal: z.string(),
  missingInformation: z.array(z.string()),
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
});
export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

/**
 * The core structured decision (§18/§55). The frontend renders this
 * directly — evidence references point at Evidence ids produced by the
 * evidence engine, never at hidden chain-of-thought.
 */
export const AgentDecisionSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  summary: z
    .string()
    .describe("What you noticed and recommend, in plain language. No hidden reasoning."),
  evidenceIds: z.array(z.string()),
  nextStep: z.string(),
  proposedAction: ActionProposalSchema.nullable(),
  requiresApproval: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  memoryCandidates: z
    .array(MemoryCandidateSchema)
    .describe("Only include a durable preference, goal, pattern, or instruction worth remembering long-term. Usually empty."),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
