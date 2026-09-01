import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { AgentRun } from "@/lib/types";
import type { AgentRunsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "agentRuns";

export function createFirestoreAgentRunsRepository(): AgentRunsRepository {
  const crud = createFirestoreCrudRepository<AgentRun>(COLLECTION);
  return {
    ...crud,
    async listRecent(userId, limit = 20) {
      const snap = await getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .orderBy("startedAt", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => doc.data() as AgentRun);
    },
  };
}
