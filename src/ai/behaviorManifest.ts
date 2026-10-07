import { createHash } from "node:crypto";
import { toJsonSchema } from "genkit/schema";
import { SAFETY_KEYWORDS, SAFETY_RESPONSE } from "./agent/prompts";
import { AgentDecisionSchema } from "./schemas/agentSchemas";
import { describeToolCatalog } from "./tools/registry";

export const hash8 = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 8);

export const BEHAVIOR_MANIFEST = {
  tools: hash8(describeToolCatalog()),
  outputSchema: hash8(JSON.stringify(toJsonSchema({ schema: AgentDecisionSchema }))),
  guardrails: hash8(JSON.stringify([SAFETY_KEYWORDS, SAFETY_RESPONSE])),
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
};
