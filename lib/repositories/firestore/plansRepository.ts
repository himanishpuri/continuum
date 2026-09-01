import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { Plan } from "@/lib/types";
import type { PlansRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "plans";

export function createFirestorePlansRepository(): PlansRepository {
  const crud = createFirestoreCrudRepository<Plan>(COLLECTION);
  return {
    ...crud,
    async getActive(userId) {
      const snap = await getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .where("status", "==", "active")
        .limit(1)
        .get();
      return snap.empty ? null : (snap.docs[0].data() as Plan);
    },
  };
}
