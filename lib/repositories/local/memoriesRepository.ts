import type { Memory } from "@/lib/types";
import type { MemoriesRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { mutateCollection, readCollection } from "./jsonStore";

const SEGMENTS = ["memories"];

export function createLocalMemoriesRepository(): MemoriesRepository {
  const crud = createLocalCrudRepository<Memory>(SEGMENTS);
  return {
    ...crud,
    async listByType(userId, type) {
      const items = await readCollection<Memory>(userId, SEGMENTS);
      return items.filter((m) => m.type === type);
    },
    async delete(userId, id) {
      await mutateCollection<Memory>(userId, SEGMENTS, (items) => items.filter((m) => m.id !== id));
    },
    async deleteAll(userId) {
      await mutateCollection<Memory>(userId, SEGMENTS, () => []);
    },
    async markUsed(userId, ids) {
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      await mutateCollection<Memory>(userId, SEGMENTS, (items) =>
        items.map((m) => (ids.includes(m.id) ? { ...m, lastUsedAt: now } : m))
      );
    },
  };
}
