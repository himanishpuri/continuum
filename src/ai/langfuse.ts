import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, setLangfuseTracerProvider, startActiveObservation, startObservation, type LangfuseGenerationAttributes, type LangfuseObservationType } from "@langfuse/tracing";
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { BEHAVIOR_MANIFEST } from "./behaviorManifest";

export const langfuseEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
let langfuse: LangfuseClient | undefined;
let processor: LangfuseSpanProcessor | undefined;
let providerForTest: NodeTracerProvider | undefined;
let contextManagerSet = false;
type Observation = { update: (attributes: LangfuseGenerationAttributes) => unknown; end: () => void };
const traceScope = new AsyncLocalStorage<{ observations: Observation[] }>();
export const SAFETY_REDACTION = "[redacted: safety stop]";

export function pseudonymousUserId(uid: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "continuum").update(uid).digest("hex").slice(0, 16);
}

export function maskTraceData(data: unknown): unknown {
  if (typeof data === "string") return data
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted: email]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[redacted: phone]");
  if (Array.isArray(data)) return data.map(maskTraceData);
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, maskTraceData(value)]));
  return data;
}

function initTracing() {
  if (!langfuseEnabled) return false;
  if (!contextManagerSet) {
    const manager = new AsyncLocalStorageContextManager().enable();
    if (!context.setGlobalContextManager(manager)) manager.disable();
    contextManagerSet = true;
  }
  if (!processor && !providerForTest) {
    processor = new LangfuseSpanProcessor({ environment: process.env.VERCEL_ENV ?? "development", release: BEHAVIOR_MANIFEST.release, exportMode: "immediate", mask: ({ data }) => maskTraceData(data) });
    setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [processor] }));
  }
  return true;
}

/** Inject an in-memory provider before tracing starts. */
export function __setLangfuseProviderForTest(provider: NodeTracerProvider) {
  providerForTest = provider;
  setLangfuseTracerProvider(provider);
}

export function redactActiveTrace() {
  const scope = traceScope.getStore();
  if (!scope) return;
  for (const observation of scope.observations) observation.update({ input: SAFETY_REDACTION, output: SAFETY_REDACTION });
}

export async function traced<T>(name: string, asType: LangfuseObservationType, attributes: LangfuseGenerationAttributes, fn: (observation: Observation | null) => Promise<T> | T): Promise<T> {
  if (!langfuseEnabled) return fn(null);
  try { initTracing(); } catch { return fn(null); }
  if (asType === "event") {
    try { startObservation(name, { ...attributes, ...(attributes.metadata && { metadata: maskTraceData(attributes.metadata) as Record<string, unknown> }) }, { asType: "event" }); }
    catch { /* tracing is best effort */ }
    return fn(null);
  }
  const parent = traceScope.getStore();
  let called = false;
  let result: T | undefined;
  let fnError: unknown;
  let fnFailed = false;
  // All observation types share input/output/metadata/update/end. The cast selects
  // that common overload while preserving the runtime type passed to Langfuse.
  try {
    return await startActiveObservation(name, async (observation) => {
      const raw = observation as Observation;
      const obs: Observation = {
        update: (value) => {
          try { raw.update({ ...value, ...(value.metadata && { metadata: maskTraceData(value.metadata) as Record<string, unknown> }) }); }
          catch { /* tracing is best effort */ }
        },
        end: () => { try { raw.end(); } catch { /* tracing is best effort */ } },
      };
      const scope = parent ?? { observations: [] };
      scope.observations.push(obs);
      try {
        obs.update(attributes);
        called = true;
        try { result = await traceScope.run(scope, () => fn(obs)); }
        catch (error) { fnError = error; fnFailed = true; throw error; }
        return result;
      } finally {
        // Each step ends on exit so its latency is real; only still-open
        // observations (the root, the current step) stay redactable.
        scope.observations.splice(scope.observations.indexOf(obs), 1);
        obs.end();
      }
    }, { asType: asType as "span", endOnExit: false });
  } catch {
    if (fnFailed) throw fnError;
    if (called) return result as T;
    return fn(null);
  }
}

export function traceTurn<T>(name: string, userId: string, sessionId: string | undefined, tag: string, input: unknown, fn: (observation: Observation | null) => Promise<T>): Promise<T> {
  if (!langfuseEnabled) return fn(null);
  try {
    initTracing();
    return traced(name, "agent", { input }, async (observation) => {
      let ran = false;
      let failed = false;
      let result: T | undefined;
      try {
        return await propagateAttributes({
          userId: pseudonymousUserId(userId), ...(sessionId && { sessionId }), tags: [tag], traceName: name,
          version: BEHAVIOR_MANIFEST.release, metadata: { release: BEHAVIOR_MANIFEST.release },
        }, async () => {
          ran = true;
          try { result = await fn(observation); return result; }
          catch (error) { failed = true; throw error; }
        });
      } catch (error) {
        if (failed) throw error;
        return ran ? result as T : fn(observation);
      }
    });
  } catch { return fn(null); }
}

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

export const flushLangfuse = () => processor?.forceFlush() ?? Promise.resolve();
