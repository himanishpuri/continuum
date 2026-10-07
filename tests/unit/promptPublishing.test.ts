import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { LangfuseClient } from "@langfuse/client";
import { shouldPublish, publishPrompts } from "@/scripts/publish-prompts";
import { canPromote, promotePrompt } from "@/scripts/promote-prompt";

vi.mock("@langfuse/client", () => ({ LangfuseClient: class {} }));

const source = readFileSync("prompts/agent_decision.prompt", "utf8");
const hash = createHash("sha256").update(source).digest("hex");

describe("prompt publishing", () => {
  it("skips identical latest and rejects unpinned hashes", () => {
    expect(shouldPublish(hash, hash, true)).toBe(false);
    expect(shouldPublish("old", hash, true)).toBe(true);
    expect(() => shouldPublish("old", "unreviewed", false)).toThrow("Unpinned");
  });

  it("publishes changed pinned source to staging", async () => {
    const get = vi.fn().mockResolvedValue({ config: { hash: "old" } });
    const create = vi.fn();
    await publishPrompts({ prompt: { get, create } } as unknown as LangfuseClient);
    expect(get).toHaveBeenCalledWith("agent_decision", { label: "latest", cacheTtlSeconds: 0 });
    expect(create).toHaveBeenCalledWith({ name: "agent_decision", type: "text", prompt: source, labels: ["staging"], config: { version: "1", hash } });
  });

  it("promotes only pinned source", async () => {
    expect(canPromote("agent_decision", source)).toBe(true);
    expect(canPromote("agent_decision", `${source}changed`)).toBe(false);
    const get = vi.fn().mockResolvedValue({ prompt: source });
    const update = vi.fn();
    await promotePrompt({ prompt: { get, update } } as unknown as LangfuseClient, "agent_decision", 4);
    expect(update).toHaveBeenCalledWith({ name: "agent_decision", version: 4, newLabels: ["production"] });
    get.mockResolvedValue({ prompt: "unreviewed" });
    await expect(promotePrompt({ prompt: { get, update } } as unknown as LangfuseClient, "agent_decision", 5)).rejects.toThrow("Unpinned");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
