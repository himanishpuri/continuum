import type { IntentClassification } from "../schemas/agentSchemas";

const ADHERENCE_KEYWORDS = [
  "consisten",
  "struggl",
  "routine",
  "habit",
  "miss",
  "skip",
  "motivat",
  "keep up",
  "fall off",
  "falling behind",
  "hard to stick",
];
const PLAN_KEYWORDS = ["change my plan", "update my plan", "shorter", "longer", "different time", "reschedule", "new plan", "adjust my"];
const SIMPLE_QUERY_PATTERNS = [/^what/i, /^when/i, /^how (many|much)/i, /^show me/i, /^do i have/i, /^am i/i];

/**
 * CLASSIFY (§17/§22). Deliberately deterministic rather than a second
 * model call: a handful of keyword checks reliably separates "answer from
 * context" questions from requests that need the full reasoning pipeline,
 * and doing it in code means DemoAgentProvider follows the identical
 * pipeline shape as Gemini without needing a model at all (§35 — don't
 * spend a Gemini call on something this cheap).
 */
export function classifyIntent(message: string): IntentClassification {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.length < 2) {
    return {
      intent: "unclear",
      goal: "Understand what the user needs.",
      missingInformation: ["what the user wants help with"],
      needsClarification: true,
      clarifyingQuestion: "Could you tell me a bit more about what you'd like help with?",
    };
  }

  if (SIMPLE_QUERY_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      intent: "simple_query",
      goal: "Answer directly from current context.",
      missingInformation: [],
      needsClarification: false,
      clarifyingQuestion: null,
    };
  }

  if (ADHERENCE_KEYWORDS.some((kw) => lower.includes(kw)) || PLAN_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      intent: "improve_adherence",
      goal: "Help the user become more consistent with their routine.",
      missingInformation: [],
      needsClarification: false,
      clarifyingQuestion: null,
    };
  }

  return {
    intent: "general_request",
    goal: "Respond helpfully using available context.",
    missingInformation: [],
    needsClarification: false,
    clarifyingQuestion: null,
  };
}
