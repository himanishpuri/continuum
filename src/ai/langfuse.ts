import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider, startObservation } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
let langfuse: LangfuseClient | undefined;
let processor: LangfuseSpanProcessor | undefined;

export function getLangfuse() {
  if (!langfuseEnabled) return null;
  return langfuse ??= new LangfuseClient();
}

export async function fetchLabeledPrompt(name: string, label = process.env.PROMPT_LABEL || "production") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = getLangfuse();
    if (!client) return null;
    const prompt = await Promise.race([
      client.prompt.get(name, { label, cacheTtlSeconds: 60, fetchTimeoutMs: 1500, maxRetries: 0 }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Langfuse timeout")), 1500); }),
    ]);
    return { source: prompt.prompt, version: prompt.version, client: prompt };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface DecisionTrace {
  model: string;
  prompt: string;
  promptSource: "bundled" | "langfuse";
  tools: string;
  outputSchema: string;
  guardrails: string;
  release: string;
  latencyMs: number;
  degraded: boolean;
  repaired: boolean;
  safetyConcern: string;
  intent: string;
  usage: { inputTokens: number; outputTokens: number };
}

export function recordDecision(meta: DecisionTrace, client?: NonNullable<Awaited<ReturnType<typeof fetchLabeledPrompt>>>["client"]) {
  if (!langfuseEnabled) return;
  if (!processor) {
    processor = new LangfuseSpanProcessor({ environment: process.env.VERCEL_ENV ?? "development", exportMode: "immediate" });
    setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [processor] }));
  }
  startObservation("agent_decision", {
    model: meta.model,
    ...(meta.promptSource === "langfuse" && client && { prompt: client }),
    usageDetails: { input: meta.usage.inputTokens, output: meta.usage.outputTokens },
    metadata: {
      prompt: meta.prompt, promptSource: meta.promptSource, tools: meta.tools, outputSchema: meta.outputSchema,
      guardrails: meta.guardrails, release: meta.release, latencyMs: meta.latencyMs, degraded: meta.degraded,
      repaired: meta.repaired, safetyConcern: meta.safetyConcern, intent: meta.intent,
    },
  }, { asType: "generation" }).end();
}

export const flushLangfuse = () => processor?.forceFlush() ?? Promise.resolve();
