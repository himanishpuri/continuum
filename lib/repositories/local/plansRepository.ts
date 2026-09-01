import type { Plan } from "@/lib/types";
import type { PlansRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { readCollection } from "./jsonStore";

const SEGMENTS = ["plans"];

export function createLocalPlansRepository(): PlansRepository {
  const crud = createLocalCrudRepository<Plan>(SEGMENTS);
  return {
    ...crud,
    async getActive(userId) {
      const items = await readCollection<Plan>(userId, SEGMENTS);
      return items.find((p) => p.status === "active") ?? null;
    },
  };
}
