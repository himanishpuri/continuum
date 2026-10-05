import type { Repositories } from "../types";
import { listUserIds } from "./jsonStore";
import { createLocalUsersRepository } from "./usersRepository";
import { createLocalMemoriesRepository } from "./memoriesRepository";
import { createLocalPlansRepository } from "./plansRepository";
import { createLocalPlanVersionsRepository } from "./planVersionsRepository";
import { createLocalEventsRepository } from "./eventsRepository";
import { createLocalAgentRunsRepository } from "./agentRunsRepository";
import { createLocalActionsRepository } from "./actionsRepository";
import { createLocalCheckinsRepository } from "./checkinsRepository";
import { createLocalPushSubscriptionsRepository } from "./pushSubscriptionsRepository";
import { createLocalConversationsRepository } from "./conversationsRepository";

export function createLocalRepositories(): Repositories {
  return {
    users: createLocalUsersRepository(),
    memories: createLocalMemoriesRepository(),
    plans: createLocalPlansRepository(),
    planVersions: createLocalPlanVersionsRepository(),
    events: createLocalEventsRepository(),
    agentRuns: createLocalAgentRunsRepository(),
    actions: createLocalActionsRepository(),
    checkins: createLocalCheckinsRepository(),
    pushSubscriptions: createLocalPushSubscriptionsRepository(),
    conversations: createLocalConversationsRepository(),
    listUserIds,
  };
}
