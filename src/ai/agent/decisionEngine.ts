import type { ConversationMessage } from "@/lib/types";
import { ai, fallback, getFallbackModels, getGeminiModel, retry } from "../genkit";
import { AgentDecisionSchema, type AgentDecision, type IntentClassification } from "../schemas/agentSchemas";
import { buildContextBlock, type AgentContext } from "./context";
import { promptInfo, renderPromptSource, sanitizePromptInput, selectAgentPrompt } from "../promptVersion";
import { BEHAVIOR_MANIFEST } from "../behaviorManifest";
import { isPinned } from "../promptPins";
import { fetchLabeledPrompt, recordDecision } from "../langfuse";
import { describeToolCatalog, findToolByActionType } from "../tools/registry";

export interface DecisionRequest {
  userId: string;
  message: string;
  history: ConversationMessage[];
  context: AgentContext;
  intent: IntentClassification;
}

export interface DecisionMeta {
  model: string;
  prompt: string;
  promptSource: "bundled" | "langfuse";
  tools: string;
  outputSchema: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  repaired: boolean;
  degraded: boolean;
  error?: string;
}

const MAX_HISTORY_TURNS = 12;
const warnedHashes = new Set<string>();

function renderHistory(history: ConversationMessage[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  if (recent.length === 0) return "CONVERSATION SO FAR: (this is the first message)";
  const lines = recent.map((m) => `${m.role === "user" ? "User" : "Continuum"}: ${m.content}`);
  return ["CONVERSATION SO FAR:", ...lines].join("\n");
}

function fallbackDecision(clarifyingQuestion: string): AgentDecision {
  return {
    intent: "unclear",
    confidence: 0,
    summary: "I wasn't able to form a clear recommendation from that.",
    evidenceIds: [],
    nextStep: "Ask a clarifying question.",
    safetyConcern: "none",
    proposedAction: null,
    requiresApproval: false,
    clarifyingQuestion,
    memoryCandidates: [],
  };
}

// Genkit's `retry` handles transient 503/429/etc. with backoff; `fallback`
// switches to a lighter model when the primary keeps failing or has been
// retired (404). Only add `fallback` when there are models to fall back to.
const fallbackModels = getFallbackModels();
const generationMiddleware = [retry(), ...(fallbackModels.length ? [fallback({ models: fallbackModels })] : [])];

/** After ~2 rounds of clarification the model should commit to a proposal rather than ask again. */
function clarificationRounds(history: ConversationMessage[]): number {
  return history.filter((m) => m.role === "agent" && m.content.trim().endsWith("?")).length;
}

/**
 * REASON + PLAN + VALIDATE (§17/§22) in a single structured Gemini call
 * (§35 — one call, not several, even across intents). Nothing returned
 * here is trusted for execution yet: a proposed action's parameters are
 * checked against its tool schema before decisionEngine hands the
 * decision back, and the policy engine (lib/policy/policyEngine.ts) makes
 * the real allow/approve call downstream regardless of what the model set.
 */
export async function decide(request: DecisionRequest): Promise<{ decision: AgentDecision; meta: DecisionMeta }> {
  const startedAt = Date.now();
  const selected = selectAgentPrompt(request.userId);
  let served = selected;
  let langfusePrompt: Awaited<ReturnType<typeof fetchLabeledPrompt>> = null;
  if (!selected.variant) {
    langfusePrompt = await fetchLabeledPrompt("agent_decision");
    if (langfusePrompt) {
      try {
        const candidate = promptInfo(langfusePrompt.source);
        if (isPinned("agent_decision", candidate.hash)) served = candidate;
        else if (!warnedHashes.has(candidate.hash)) {
          console.warn(`Langfuse prompt ${candidate.hash} is not pinned; using bundled prompt`);
          warnedHashes.add(candidate.hash);
        }
      } catch {
        console.warn("Langfuse prompt is invalid; using bundled prompt");
      }
    }
  }
  const meta: DecisionMeta = {
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    prompt: served.id,
    promptSource: served === selected ? "bundled" : "langfuse",
    tools: BEHAVIOR_MANIFEST.tools,
    outputSchema: BEHAVIOR_MANIFEST.outputSchema,
    latencyMs: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    repaired: false,
    degraded: false,
  };
  const finish = (decision: AgentDecision) => {
    meta.latencyMs = Date.now() - startedAt;
    try {
      recordDecision({ ...meta, guardrails: BEHAVIOR_MANIFEST.guardrails, release: BEHAVIOR_MANIFEST.release,
        safetyConcern: decision.safetyConcern, intent: decision.intent }, meta.promptSource === "langfuse" ? langfusePrompt?.client : undefined);
    } catch (error) { console.warn("Langfuse trace failed", error); }
    return { decision, meta };
  };
  const rounds = clarificationRounds(request.history);
  const promptInput = {
    contextBlock: sanitizePromptInput(buildContextBlock(request.context)),
    history: sanitizePromptInput(renderHistory(request.history)),
    toolCatalog: describeToolCatalog(),
    intent: request.intent.intent,
    pushToCommit: rounds >= 2,
    message: sanitizePromptInput(request.message),
  };

  const generate = async (repairProblem?: string, repairActionType?: string) => {
    const requestedModel = getGeminiModel();
    meta.model = requestedModel.name;
    const input = {
      ...promptInput,
      ...(repairProblem && { repairProblem: sanitizePromptInput(repairProblem), repairActionType: sanitizePromptInput(repairActionType ?? "") }),
    };
    const rendered = meta.promptSource === "langfuse"
      ? await renderPromptSource(ai, served.source, input)
      : await ai.prompt("agent_decision", selected.variant ? { variant: selected.variant } : undefined).render(input);
    const response = await ai.generate({
      ...rendered,
      model: requestedModel,
      output: { schema: AgentDecisionSchema },
      use: generationMiddleware,
    });
    meta.usage.inputTokens += response.usage?.inputTokens ?? 0;
    meta.usage.outputTokens += response.usage?.outputTokens ?? 0;
    // The Google GenAI plugin places the raw Gemini response in custom.
    const servedModel = (response.custom as { modelVersion?: unknown } | undefined)?.modelVersion;
    if (typeof servedModel === "string") meta.model = servedModel;
    return response;
  };

  // Returns null if valid (mutating parameters to the parsed form), or a
  // human-readable description of what's wrong with the proposed action.
  function validateProposal(d: AgentDecision): string | null {
    if (!d.proposedAction) return null;
    const tool = findToolByActionType(d.proposedAction.actionType);
    if (!tool) return `"${d.proposedAction.actionType}" is not a valid action type.`;
    const parsed = tool.inputSchema.safeParse(d.proposedAction.parameters);
    if (!parsed.success) {
      return parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    }
    d.proposedAction.parameters = parsed.data as Record<string, unknown>;
    return null;
  }

  let decision: AgentDecision;
  try {
    const response = await generate();
    if (!response.output) {
      meta.degraded = true;
      meta.error = "Model returned no output";
      return finish(fallbackDecision("I had trouble forming a response — could you rephrase that?"));
    }
    decision = response.output;
    if (decision.safetyConcern === "urgent") return finish(decision);

    // One repair round: if the proposal doesn't satisfy the tool schema, tell
    // the model exactly what was wrong and let it try again.
    const problem = validateProposal(decision);
    if (problem && decision.proposedAction) {
      meta.repaired = true;
      const retry = await generate(problem, decision.proposedAction.actionType);
      if (retry.output) decision = retry.output;
    }
  } catch (err) {
    console.error("Gemini decision call failed", err);
    meta.degraded = true;
    meta.error = err instanceof Error ? err.message : String(err);
    return finish(fallbackDecision("I'm having trouble reaching my reasoning engine right now — could you try again in a moment?"));
  }

  // Final guard: if a proposed action still doesn't validate, drop it but keep a useful question.
  if (validateProposal(decision) && decision.proposedAction) {
    return finish({
      ...decision,
      proposedAction: null,
      requiresApproval: false,
      clarifyingQuestion:
        decision.clarifyingQuestion ??
        "I have most of what I need but not quite enough to set this up cleanly — could you restate the goal, days, and time in one line?",
    });
  }

  return finish(decision);
}
