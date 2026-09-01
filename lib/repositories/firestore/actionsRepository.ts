import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { ActionStatus, AgentAction } from "@/lib/types";
import type { ActionsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "actions";

function collection(userId: string) {
  return getAdminFirestore().collection("users").doc(userId).collection(COLLECTION);
}

export function createFirestoreActionsRepository(): ActionsRepository {
  const crud = createFirestoreCrudRepository<AgentAction>(COLLECTION);
  return {
    ...crud,
    async findByIdempotencyKey(userId, key) {
      const snap = await collection(userId).where("idempotencyKey", "==", key).limit(1).get();
      return snap.empty ? null : (snap.docs[0].data() as AgentAction);
    },
    async listByStatus(userId, statuses: ActionStatus[]) {
      const snap = await collection(userId).where("status", "in", statuses.slice(0, 10)).get();
      return snap.docs.map((doc) => doc.data() as AgentAction);
    },
  };
}
