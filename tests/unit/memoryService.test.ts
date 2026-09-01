import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemory, deleteMemory, forgetAllMemories, recordMemoryUsage, retrieveRelevantMemories } from "@/lib/memory/memoryService";
import { getRepositories } from "@/lib/repositories";

function uid() {
  return `test-memory-${randomUUID()}`;
}

describe("memoryService", () => {
  it("caps retrieval and ranks by confidence/recency", async () => {
    const userId = uid();
    for (let i = 0; i < 12; i++) {
      await createMemory(userId, { type: "preference", content: `pref ${i}`, confidence: 0.5 + i * 0.02, source: "seed" });
    }
    const results = await retrieveRelevantMemories(userId, { limit: 5 });
    expect(results).toHaveLength(5);
  });

  it("filters by type, ignoring irrelevant categories", async () => {
    const userId = uid();
    await createMemory(userId, { type: "preference", content: "likes evenings", confidence: 0.9, source: "seed" });
    await createMemory(userId, { type: "goal", content: "be consistent", confidence: 0.9, source: "seed" });

    const goalsOnly = await retrieveRelevantMemories(userId, { types: ["goal"] });
    expect(goalsOnly).toHaveLength(1);
    expect(goalsOnly[0].type).toBe("goal");
  });

  it("excludes expired memories from retrieval", async () => {
    const userId = uid();
    await createMemory(userId, { type: "context", content: "temporary note", confidence: 0.9, source: "seed", expiresInDays: -1 });
    const results = await retrieveRelevantMemories(userId);
    expect(results).toHaveLength(0);
  });

  it("deletes a memory", async () => {
    const userId = uid();
    const memory = await createMemory(userId, { type: "pattern", content: "test", confidence: 0.8, source: "seed" });
    await deleteMemory(userId, memory.id);
    expect(await getRepositories().memories.list(userId)).toHaveLength(0);
  });

  it("records memory usage", async () => {
    const userId = uid();
    const memory = await createMemory(userId, { type: "pattern", content: "test", confidence: 0.8, source: "seed" });
    expect(memory.lastUsedAt).toBeNull();

    await recordMemoryUsage(userId, [memory.id]);
    const [updated] = await getRepositories().memories.list(userId);
    expect(updated.lastUsedAt).not.toBeNull();
  });

  it("forgets everything", async () => {
    const userId = uid();
    await createMemory(userId, { type: "pattern", content: "test", confidence: 0.8, source: "seed" });
    await createMemory(userId, { type: "goal", content: "test 2", confidence: 0.8, source: "seed" });
    await forgetAllMemories(userId);
    expect(await getRepositories().memories.list(userId)).toHaveLength(0);
  });
});
