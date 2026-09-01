import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { Conversation, ConversationMessage } from "@/lib/types";
import type { ConversationsRepository } from "../types";
import { createFirestoreCrudRepository } from "./genericCrud";

const COLLECTION = "conversations";

export function createFirestoreConversationsRepository(): ConversationsRepository {
  const crud = createFirestoreCrudRepository<Conversation>(COLLECTION);
  return {
    ...crud,
    async addMessage(userId, conversationId, message) {
      const ref = getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .doc(conversationId)
        .collection("messages")
        .doc();
      const record: ConversationMessage = { ...message, id: ref.id, conversationId };
      await ref.set(record);
      return record;
    },
    async listMessages(userId, conversationId) {
      const snap = await getAdminFirestore()
        .collection("users")
        .doc(userId)
        .collection(COLLECTION)
        .doc(conversationId)
        .collection("messages")
        .orderBy("createdAt", "asc")
        .get();
      return snap.docs.map((doc) => doc.data() as ConversationMessage);
    },
  };
}
