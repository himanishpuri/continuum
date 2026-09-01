import "server-only";
import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

/**
 * Genkit instance for the real (non-demo) agent path. Only imported by
 * GeminiAgentProvider, which is itself only constructed when
 * GEMINI_API_KEY is set and DEMO_MODE is off — DemoAgentProvider never
 * touches this module.
 */
export const ai = genkit({
  plugins: [googleAI()],
});

/** GEMINI_MODEL defaults to a floating alias so the app doesn't pin to a model that eventually goes stale. */
export function getGeminiModel() {
  const modelId = process.env.GEMINI_MODEL || "gemini-flash-latest";
  return googleAI.model(modelId);
}
