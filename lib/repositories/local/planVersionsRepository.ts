import type { PlanVersion } from "@/lib/types";
import type { PlanVersionsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { readCollection } from "./jsonStore";

const SEGMENTS = ["planVersions"];

export function createLocalPlanVersionsRepository(): PlanVersionsRepository {
  const crud = createLocalCrudRepository<PlanVersion>(SEGMENTS);
  return {
    ...crud,
    async listByPlan(userId, planId) {
      const items = await readCollection<PlanVersion>(userId, SEGMENTS);
      return items.filter((v) => v.planId === planId).sort((a, b) => a.version - b.version);
    },
  };
}
