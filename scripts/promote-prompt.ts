import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LangfuseClient } from "@langfuse/client";
import { isPinned } from "../src/ai/promptPins";

export const canPromote = (name: string, source: string) => isPinned(name, createHash("sha256").update(source).digest("hex"));

export async function promotePrompt(client: LangfuseClient, name: string, version: number) {
  const prompt = await client.prompt.get(name, { version, cacheTtlSeconds: 0 });
  if (!canPromote(name, prompt.prompt)) throw new Error(`Unpinned prompt: ${name}@${version}`);
  await client.prompt.update({ name, version, newLabels: ["production"] });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [name, rawVersion] = process.argv.slice(2);
  const version = Number(rawVersion);
  if (!name || !Number.isInteger(version) || version < 1) throw new Error("Usage: npm run prompts:promote -- <name> <langfuseVersion>");
  promotePrompt(new LangfuseClient(), name, version).catch((error) => { console.error(error); process.exitCode = 1; });
}
