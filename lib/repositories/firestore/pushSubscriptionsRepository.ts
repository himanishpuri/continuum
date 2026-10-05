import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { PushSubscriptionRecord } from "@/lib/types";
import type { PushSubscriptionsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

function collection(userId: string) {
  return getAdminFirestore().collection("users").doc(userId).collection("pushSubscriptions");
}

export function createFirestorePushSubscriptionsRepository(): PushSubscriptionsRepository {
  const crud = createFirestoreCrudRepository<PushSubscriptionRecord>("pushSubscriptions");
  return {
    ...crud,
    async findByEndpoint(userId, endpoint) {
      const snap = await collection(userId).where("endpoint", "==", endpoint).limit(1).get();
      return snap.empty ? null : snap.docs[0].data() as PushSubscriptionRecord;
    },
    async deleteByEndpoint(userId, endpoint) {
      const snap = await collection(userId).where("endpoint", "==", endpoint).get();
      const batch = getAdminFirestore().batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    },
  };
}
