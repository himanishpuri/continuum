import type { AgentRun } from "@/lib/types";
import type { AgentRunsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { readCollection } from "./jsonStore";

const SEGMENTS = ["agentRuns"];

export function createLocalAgentRunsRepository(): AgentRunsRepository {
  const crud = createLocalCrudRepository<AgentRun>(SEGMENTS);
  return {
    ...crud,
    async listRecent(userId, limit = 20) {
      const items = await readCollection<AgentRun>(userId, SEGMENTS);
      return [...items].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, limit);
    },
  };
}
