import { randomUUID } from "node:crypto";
import { mutateCollection, readCollection } from "./jsonStore";
import type { CrudRepository } from "../types";

/**
 * Builds a CrudRepository backed by a single JSON file per user
 * (`.demo-data/<uid>/<segments>.json`). Shared by every simple list-shaped
 * collection (memories, plans, events, agentRuns, actions, checkins,
 * planVersions) so each domain repo only has to add its own query methods.
 */
export function createLocalCrudRepository<T extends { id: string; userId: string }>(
  segments: string[]
): CrudRepository<T> {
  return {
    async list(userId) {
      return readCollection<T>(userId, segments);
    },
    async get(userId, id) {
      const items = await readCollection<T>(userId, segments);
      return items.find((item) => item.id === id) ?? null;
    },
    async create(userId, data) {
      const record = { ...data, id: randomUUID(), userId } as unknown as T;
      await mutateCollection<T>(userId, segments, (items) => [...items, record]);
      return record;
    },
    async update(userId, id, patch) {
      let updated: T | undefined;
      await mutateCollection<T>(userId, segments, (items) =>
        items.map((item) => {
          if (item.id !== id) return item;
          updated = { ...item, ...patch } as T;
          return updated;
        })
      );
      if (!updated) throw new Error(`Record not found: ${segments.join("/")}/${id}`);
      return updated;
    },
  };
}
