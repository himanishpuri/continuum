import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const name = "agent_decision";
const warnedVariants = new Set<string>();

// Dotprompt splits roles on "<<<dotprompt:…>>>" markers in rendered text; collapsing every
// run of 3+ "<" means user text can never form one, nested tricks included.
export const sanitizePromptInput = (value: string) => value.replace(/<{3,}/g, "<<");

export function resolveAgentPrompt(variant = process.env.PROMPT_VARIANT) {
  const validVariant = variant && /^[a-zA-Z0-9_-]+$/.test(variant);
  const variantPath = validVariant ? join(process.cwd(), "prompts", `${name}.${variant}.prompt`) : "";
  const selectedVariant = variantPath && existsSync(variantPath) ? variant : undefined;
  if (variant && !selectedVariant && !warnedVariants.has(variant)) {
    console.warn(`Prompt variant "${variant}" not found; using ${name}.prompt`);
    warnedVariants.add(variant);
  }
  const source = readFileSync(join(process.cwd(), "prompts", `${name}${selectedVariant ? `.${selectedVariant}` : ""}.prompt`), "utf8");
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const version = frontmatter?.[1].match(/^version:\s*(\d+)\s*$/m)?.[1];
  if (!version) throw new Error(`${name} prompt is missing a numeric version`);
  const hash = createHash("sha256").update(source).digest("hex");
  return { name, ...(selectedVariant && { variant: selectedVariant }), version, hash, id: `${name}@${version}#${hash.slice(0, 8)}${selectedVariant ? `+${selectedVariant}` : ""}` };
}

export const AGENT_PROMPT = resolveAgentPrompt();
