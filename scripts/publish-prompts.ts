import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LangfuseClient } from "@langfuse/client";
import { isPinned } from "../src/ai/promptPins";

export const shouldPublish = (latestHash: string | undefined, hash: string, pinned: boolean) => {
  if (!pinned) throw new Error(`Unpinned prompt hash: ${hash}`);
  return latestHash !== hash;
};

export async function publishPrompts(client: LangfuseClient) {
  for (const file of readdirSync("prompts").filter((file) => file.endsWith(".prompt") && !file.startsWith("_"))) {
    const name = file.slice(0, -7);
    const source = readFileSync(join("prompts", file), "utf8");
    const version = source.match(/^version:\s*(\d+)\s*$/m)?.[1];
    if (!version) throw new Error(`${file} has no numeric version`);
    const hash = createHash("sha256").update(source).digest("hex");
    if (!isPinned(name, hash)) throw new Error(`Unpinned prompt: ${file}`);
    const latest = await client.prompt.get(name, { label: "latest", cacheTtlSeconds: 0 }).catch(() => null);
    if (!shouldPublish((latest?.config as { hash?: string } | undefined)?.hash, hash, true)) continue;
    await client.prompt.create({ name, type: "text", prompt: source, labels: ["staging"], config: { version, hash } });
    console.log(`Published ${name}@${version}#${hash.slice(0, 8)} to staging`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  publishPrompts(new LangfuseClient()).catch((error) => { console.error(error); process.exitCode = 1; });
}
