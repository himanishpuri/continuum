import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { genkit } from "genkit";

const name = "agent_decision";
const warnedVariants = new Set<string>();

// Dotprompt splits roles on "<<<dotprompt:…>>>" markers in rendered text; collapsing every
// run of 3+ "<" means user text can never form one, nested tricks included.
export const sanitizePromptInput = (value: string) => value.replace(/<{3,}/g, "<<");

export function promptInfo(source: string, variant?: string) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const version = frontmatter?.[1].match(/^version:\s*(\d+)\s*$/m)?.[1];
  if (!version) throw new Error(`${name} prompt is missing a numeric version`);
  const hash = createHash("sha256").update(source).digest("hex");
  return { name, ...(variant && { variant }), source, version, hash, id: `${name}@${version}#${hash.slice(0, 8)}${variant ? `+${variant}` : ""}` };
}

export function resolveAgentPrompt(variant = process.env.PROMPT_VARIANT) {
  const validVariant = variant && /^[a-zA-Z0-9_-]+$/.test(variant);
  const variantPath = validVariant ? join(process.cwd(), "prompts", `${name}.${variant}.prompt`) : "";
  const selectedVariant = variantPath && existsSync(variantPath) ? variant : undefined;
  if (variant && !selectedVariant && !warnedVariants.has(variant)) {
    console.warn(`Prompt variant "${variant}" not found; using ${name}.prompt`);
    warnedVariants.add(variant);
  }
  const source = readFileSync(join(process.cwd(), "prompts", `${name}${selectedVariant ? `.${selectedVariant}` : ""}.prompt`), "utf8");
  return promptInfo(source, selectedVariant || undefined);
}

const setting = process.env.PROMPT_VARIANT ?? "";
const match = setting.match(/^([a-zA-Z0-9_-]+)(?::(\d{1,3}))?$/);
const percentage = match ? Number(match[2] ?? 100) : 0;
export const AGENT_PROMPT = resolveAgentPrompt("");
const variantPrompt = match && percentage <= 100 ? resolveAgentPrompt(match[1]) : AGENT_PROMPT;

export function selectAgentPrompt(userId: string) {
  if (!match || percentage === 0 || variantPrompt === AGENT_PROMPT) return AGENT_PROMPT;
  const bucket = parseInt(createHash("sha256").update(userId).digest("hex").slice(0, 8), 16) % 100;
  return bucket < percentage ? variantPrompt : AGENT_PROMPT;
}

const registered = new WeakMap<object, Set<string>>();

export async function renderPromptSource(ai: ReturnType<typeof genkit>, source: string, input: Record<string, unknown>) {
  const info = promptInfo(source);
  const key = `lf${info.hash.slice(0, 16)}`;
  let names = registered.get(ai);
  if (!names) { names = new Set(); registered.set(ai, names); }
  if (!names.has(key)) {
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace(/\r?\n$/, "");
    ai.definePrompt({ name: key, messages: body });
    names.add(key);
  }
  return ai.prompt(key).render(input);
}
