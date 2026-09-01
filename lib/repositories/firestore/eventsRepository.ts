import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { EventRecord } from "@/lib/types";
import type { EventsRepository } from "../types";

const COLLECTION = "events";

function collection(userId: string) {
  return getAdminFirestore().collection("users").doc(userId).collection(COLLECTION);
}

export function createFirestoreEventsRepository(): EventsRepository {
  return {
    async list(userId, opts) {
      let query: FirebaseFirestore.Query = collection(userId);
      if (opts?.types && opts.types.length > 0) {
        query = query.where("type", "in", opts.types.slice(0, 10));
      }
      if (opts?.since) {
        query = query.where("timestamp", ">=", opts.since);
      }
      query = query.orderBy("timestamp", "desc");
      if (opts?.limit) query = query.limit(opts.limit);
      const snap = await query.get();
      return snap.docs.map((doc) => doc.data() as EventRecord);
    },
    async create(userId, event) {
      const ref = collection(userId).doc();
      const record: EventRecord = { ...event, id: ref.id, userId };
      await ref.set(record);
      return record;
    },
  };
}
