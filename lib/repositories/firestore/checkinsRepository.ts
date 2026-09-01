import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { CheckIn } from "@/lib/types";
import type { CheckinsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "checkins";

export function createFirestoreCheckinsRepository(): CheckinsRepository {
  const crud = createFirestoreCrudRepository<CheckIn>(COLLECTION);
  return {
    ...crud,
    async listDue(userId, atOrBefore) {
      const snap = await getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .where("status", "==", "pending")
        .where("scheduledAt", "<=", atOrBefore)
        .get();
      return snap.docs.map((doc) => doc.data() as CheckIn);
    },
  };
}
