import { randomUUID } from "node:crypto";
import type { EventRecord } from "@/lib/types";
import type { EventsRepository } from "../types";
import { mutateCollection, readCollection } from "./jsonStore";

const SEGMENTS = ["events"];

export function createLocalEventsRepository(): EventsRepository {
  return {
    async list(userId, opts) {
      let items = await readCollection<EventRecord>(userId, SEGMENTS);
      if (opts?.types) items = items.filter((e) => opts.types!.includes(e.type));
      if (opts?.since) items = items.filter((e) => e.timestamp >= opts.since!);
      items = [...items].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (opts?.limit) items = items.slice(0, opts.limit);
      return items;
    },
    async create(userId, event) {
      const record: EventRecord = { ...event, id: randomUUID(), userId };
      await mutateCollection<EventRecord>(userId, SEGMENTS, (items) => [...items, record]);
      return record;
    },
  };
}
