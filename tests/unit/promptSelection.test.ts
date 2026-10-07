import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    existsSync: (path: string) => path.endsWith("agent_decision.sample.prompt") || fs.existsSync(path),
    readFileSync: (path: string, encoding: BufferEncoding) => fs.readFileSync(
      path.endsWith("agent_decision.sample.prompt") ? join(process.cwd(), "prompts", "agent_decision.prompt") : path,
      encoding,
    ),
  };
});

async function selection(setting: string) {
  vi.stubEnv("PROMPT_VARIANT", setting);
  vi.resetModules();
  return import("@/src/ai/promptVersion");
}

afterEach(() => vi.unstubAllEnvs());

describe("sticky prompt variants", () => {
  it("assigns the same user to the same arm", async () => {
    const { selectAgentPrompt } = await selection("sample:50");
    expect(selectAgentPrompt("u-42")).toEqual(selectAgentPrompt("u-42"));
  });

  it("assigns approximately half of 1000 user IDs to :50", async () => {
    const { selectAgentPrompt } = await selection("sample:50");
    const selected = Array.from({ length: 1000 }, (_, i) => selectAgentPrompt(`user-${i}`)).filter((prompt) => prompt.variant).length;
    expect(selected).toBeGreaterThanOrEqual(450);
    expect(selected).toBeLessThanOrEqual(550);
  });

  it("assigns none to :0 and all to a plain name", async () => {
    const zero = await selection("sample:0");
    expect(zero.selectAgentPrompt("u").variant).toBeUndefined();
    const all = await selection("sample");
    expect(all.selectAgentPrompt("u").variant).toBe("sample");
  });

  it("uses baseline for an unknown file", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { selectAgentPrompt } = await selection("missing:100");
    expect(selectAgentPrompt("u").variant).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
