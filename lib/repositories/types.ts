import type {
  ActionStatus,
  AgentAction,
  AgentPermissions,
  AgentRun,
  CheckIn,
  Conversation,
  ConversationMessage,
  EventRecord,
  EventType,
  Memory,
  MemoryType,
  Plan,
  PlanVersion,
  UserPreferences,
  UserProfile,
  UserRecord,
  UserSettings,
} from "@/lib/types";

/** Generic CRUD surface backing the list-shaped per-user subcollections. */
export interface CrudRepository<T extends { id: string }> {
  list(userId: string): Promise<T[]>;
  get(userId: string, id: string): Promise<T | null>;
  create(userId: string, data: Omit<T, "id" | "userId">): Promise<T>;
  update(userId: string, id: string, patch: Partial<Omit<T, "id" | "userId">>): Promise<T>;
}

export interface UsersRepository {
  getUser(userId: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<UserRecord>;
  updateProfile(userId: string, patch: Partial<UserProfile>): Promise<UserProfile>;
  updatePreferences(userId: string, patch: Partial<UserPreferences>): Promise<UserPreferences>;
  updateSettings(
    userId: string,
    patch: Partial<Omit<UserSettings, "permissions">> & { permissions?: Partial<AgentPermissions> }
  ): Promise<UserSettings>;
}

export interface MemoriesRepository extends CrudRepository<Memory> {
  listByType(userId: string, type: MemoryType): Promise<Memory[]>;
  delete(userId: string, id: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  markUsed(userId: string, ids: string[]): Promise<void>;
}

export interface PlansRepository extends CrudRepository<Plan> {
  getActive(userId: string): Promise<Plan | null>;
}

export interface PlanVersionsRepository extends CrudRepository<PlanVersion> {
  listByPlan(userId: string, planId: string): Promise<PlanVersion[]>;
}

export interface EventsRepository {
  list(userId: string, opts?: { types?: EventType[]; limit?: number; since?: string }): Promise<EventRecord[]>;
  create(userId: string, event: Omit<EventRecord, "id" | "userId">): Promise<EventRecord>;
}

export interface AgentRunsRepository extends CrudRepository<AgentRun> {
  listRecent(userId: string, limit?: number): Promise<AgentRun[]>;
}

export interface ActionsRepository extends CrudRepository<AgentAction> {
  findByIdempotencyKey(userId: string, key: string): Promise<AgentAction | null>;
  listByStatus(userId: string, statuses: ActionStatus[]): Promise<AgentAction[]>;
}

export interface CheckinsRepository extends CrudRepository<CheckIn> {
  listDue(userId: string, atOrBefore: string): Promise<CheckIn[]>;
}

export interface ConversationsRepository extends CrudRepository<Conversation> {
  addMessage(userId: string, conversationId: string, message: Omit<ConversationMessage, "id" | "conversationId">): Promise<ConversationMessage>;
  listMessages(userId: string, conversationId: string): Promise<ConversationMessage[]>;
}

export interface Repositories {
  users: UsersRepository;
  memories: MemoriesRepository;
  plans: PlansRepository;
  planVersions: PlanVersionsRepository;
  events: EventsRepository;
  agentRuns: AgentRunsRepository;
  actions: ActionsRepository;
  checkins: CheckinsRepository;
  conversations: ConversationsRepository;
  /** Enumerate user ids — used by the background job to scan for due check-ins. */
  listUserIds(): Promise<string[]>;
}
