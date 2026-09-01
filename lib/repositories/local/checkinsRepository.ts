import type { CheckIn } from "@/lib/types";
import type { CheckinsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { readCollection } from "./jsonStore";

const SEGMENTS = ["checkins"];

export function createLocalCheckinsRepository(): CheckinsRepository {
  const crud = createLocalCrudRepository<CheckIn>(SEGMENTS);
  return {
    ...crud,
    async listDue(userId, atOrBefore) {
      const items = await readCollection<CheckIn>(userId, SEGMENTS);
      return items.filter((c) => c.status === "pending" && c.scheduledAt <= atOrBefore);
    },
  };
}
