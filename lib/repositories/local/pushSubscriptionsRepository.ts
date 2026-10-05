import type { PushSubscriptionRecord } from "@/lib/types";
import type { PushSubscriptionsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { mutateCollection, readCollection } from "./jsonStore";

const SEGMENTS = ["pushSubscriptions"];

export function createLocalPushSubscriptionsRepository(): PushSubscriptionsRepository {
  const crud = createLocalCrudRepository<PushSubscriptionRecord>(SEGMENTS);
  return {
    ...crud,
    async findByEndpoint(userId, endpoint) {
      return (await readCollection<PushSubscriptionRecord>(userId, SEGMENTS)).find((item) => item.endpoint === endpoint) ?? null;
    },
    async deleteByEndpoint(userId, endpoint) {
      await mutateCollection<PushSubscriptionRecord>(userId, SEGMENTS, (items) => items.filter((item) => item.endpoint !== endpoint));
    },
  };
}
