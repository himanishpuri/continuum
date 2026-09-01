import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { Memory } from "@/lib/types";
import type { MemoriesRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "memories";

function collection(userId: string) {
  return getAdminFirestore().collection("users").doc(userId).collection(COLLECTION);
}

export function createFirestoreMemoriesRepository(): MemoriesRepository {
  const crud = createFirestoreCrudRepository<Memory>(COLLECTION);
  return {
    ...crud,
    async listByType(userId, type) {
      const snap = await collection(userId).where("type", "==", type).get();
      return snap.docs.map((doc) => doc.data() as Memory);
    },
    async delete(userId, id) {
      await collection(userId).doc(id).delete();
    },
    async deleteAll(userId) {
      const snap = await collection(userId).get();
      const batch = getAdminFirestore().batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    },
    async markUsed(userId, ids) {
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      const batch = getAdminFirestore().batch();
      ids.forEach((id) => batch.set(collection(userId).doc(id), { lastUsedAt: now }, { merge: true }));
      await batch.commit();
    },
  };
}
