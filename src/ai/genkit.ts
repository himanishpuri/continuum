import "server-only";
import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { fallback, retry } from "@genkit-ai/middleware";

/**
 * Genkit instance for the real (non-demo) agent path. Only imported by
 * GeminiAgentProvider, which is itself only constructed when
 * GEMINI_API_KEY is set and DEMO_MODE is off — DemoAgentProvider never
 * touches this module.
 *
 * `retry` and `fallback` are registered as plugins so they show up in the
 * Genkit Dev UI; they're applied per-call via `use: [...]` in
 * src/ai/agent/decisionEngine.ts.
 */
export const ai = genkit({
  plugins: [googleAI(), retry.plugin(), fallback.plugin()],
});

export { fallback, retry };

/**
 * GEMINI_MODEL should be a concrete, currently-served model id. The
 * `gemini-flash-latest` floating alias sounds nice but routes to whatever
 * preview model is newest, which is frequently overloaded (503) — pin a
 * real one and let the fallback list below cover the rest.
 */
export function getGeminiModel() {
  return googleAI.model(process.env.GEMINI_MODEL || "gemini-3.5-flash");
}

/**
 * Models the `fallback` middleware tries, in order, when the primary
 * returns a transient error OR 404s (a pinned model that Google has since
 * retired). Defaults to one lighter model; set GEMINI_FALLBACK_MODELS to
 * a comma-separated list, or empty to disable.
 */
export function getFallbackModels() {
  const raw = process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-lite-latest";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => googleAI.model(id));
}
