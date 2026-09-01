import { randomUUID } from "node:crypto";
import type { Conversation, ConversationMessage } from "@/lib/types";
import type { ConversationsRepository } from "../types";
import { createLocalCrudRepository } from "./genericCrud";
import { mutateCollection, readCollection } from "./jsonStore";

const SEGMENTS = ["conversations"];

export function createLocalConversationsRepository(): ConversationsRepository {
  const crud = createLocalCrudRepository<Conversation>(SEGMENTS);
  return {
    ...crud,
    async addMessage(userId, conversationId, message) {
      const record: ConversationMessage = { ...message, id: randomUUID(), conversationId };
      const segments = ["conversations", conversationId, "messages"];
      await mutateCollection<ConversationMessage>(userId, segments, (items) => [...items, record]);
      return record;
    },
    async listMessages(userId, conversationId) {
      const segments = ["conversations", conversationId, "messages"];
      return readCollection<ConversationMessage>(userId, segments);
    },
  };
}
