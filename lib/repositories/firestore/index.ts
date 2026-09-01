import { getAdminFirestore } from "@/lib/auth/firebaseAdmin";
import type { Repositories } from "../types";
import { createFirestoreUsersRepository } from "./usersRepository";
import { createFirestoreMemoriesRepository } from "./memoriesRepository";
import { createFirestorePlansRepository } from "./plansRepository";
import { createFirestorePlanVersionsRepository } from "./planVersionsRepository";
import { createFirestoreEventsRepository } from "./eventsRepository";
import { createFirestoreAgentRunsRepository } from "./agentRunsRepository";
import { createFirestoreActionsRepository } from "./actionsRepository";
import { createFirestoreCheckinsRepository } from "./checkinsRepository";
import { createFirestoreConversationsRepository } from "./conversationsRepository";

export function createFirestoreRepositories(): Repositories {
  return {
    users: createFirestoreUsersRepository(),
    memories: createFirestoreMemoriesRepository(),
    plans: createFirestorePlansRepository(),
    planVersions: createFirestorePlanVersionsRepository(),
    events: createFirestoreEventsRepository(),
    agentRuns: createFirestoreAgentRunsRepository(),
    actions: createFirestoreActionsRepository(),
    checkins: createFirestoreCheckinsRepository(),
    conversations: createFirestoreConversationsRepository(),
    async listUserIds() {
      const snap = await getAdminFirestore().collection("users").listDocuments();
      return snap.map((doc) => doc.id);
    },
  };
}
