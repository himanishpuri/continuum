import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { PlanVersion } from "@/lib/types";
import type { PlanVersionsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "planVersions";

export function createFirestorePlanVersionsRepository(): PlanVersionsRepository {
  const crud = createFirestoreCrudRepository<PlanVersion>(COLLECTION);
  return {
    ...crud,
    async listByPlan(userId, planId) {
      const snap = await getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .where("planId", "==", planId)
        .get();
      return snap.docs.map((doc) => doc.data() as PlanVersion).sort((a, b) => a.version - b.version);
    },
  };
}
