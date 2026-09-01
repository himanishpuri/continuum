import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { CrudRepository } from "../types";

/**
 * Builds a CrudRepository backed by `users/{uid}/{collectionName}` in
 * Firestore. Mirrors the local JSON implementation's semantics exactly so
 * callers never need to know which backend is active.
 */
export function createFirestoreCrudRepository<T extends { id: string; userId: string }>(
  collectionName: string
): CrudRepository<T> {
  function collection(userId: string) {
    return getAdminFirestore().collection("users").doc(userId).collection(collectionName);
  }

  return {
    async list(userId) {
      const snap = await collection(userId).get();
      return snap.docs.map((doc) => doc.data() as T);
    },
    async get(userId, id) {
      const doc = await collection(userId).doc(id).get();
      return doc.exists ? (doc.data() as T) : null;
    },
    async create(userId, data) {
      const ref = collection(userId).doc();
      const record = { ...data, id: ref.id, userId } as unknown as T;
      await ref.set(record);
      return record;
    },
    async update(userId, id, patch) {
      const ref = collection(userId).doc(id);
      await ref.set(patch, { merge: true });
      const updated = await ref.get();
      if (!updated.exists) throw new Error(`Record not found: ${collectionName}/${id}`);
      return updated.data() as T;
    },
  };
}
