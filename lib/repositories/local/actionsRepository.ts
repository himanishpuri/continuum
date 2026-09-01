import type { ActionStatus, AgentAction } from "@/lib/types";
import type { ActionsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { readCollection } from "./jsonStore";

const SEGMENTS = ["actions"];

export function createLocalActionsRepository(): ActionsRepository {
  const crud = createLocalCrudRepository<AgentAction>(SEGMENTS);
  return {
    ...crud,
    async findByIdempotencyKey(userId, key) {
      const items = await readCollection<AgentAction>(userId, SEGMENTS);
      return items.find((a) => a.idempotencyKey === key) ?? null;
    },
    async listByStatus(userId, statuses: ActionStatus[]) {
      const items = await readCollection<AgentAction>(userId, SEGMENTS);
      return items.filter((a) => statuses.includes(a.status));
    },
  };
}
