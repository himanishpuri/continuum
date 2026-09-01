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

/**
 * GEMINI_MODEL should be a concrete, currently-served model id. The
 * `gemini-flash-latest` floating alias sounds nice but routes to whatever
 * preview model is newest, which is frequently overloaded (503) — pin a
 * real one and bump it deliberately.
 */
export function getGeminiModel() {
  const modelId = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  return googleAI.model(modelId);
}
