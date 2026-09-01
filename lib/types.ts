/**
 * Shared domain types for Continuum. These are the source of truth for
 * every layer (repositories, services, agent, API routes, UI) — the
 * Firestore and local-JSON repository implementations both persist data
 * shaped exactly like this, and the AI layer's structured schemas
 * (src/ai/schemas) map onto these types at the boundary.
 */

export type ID = string;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserProfile {
  uid: ID;
  name: string;
  email: string | null;
  timezone: string;
  createdAt: string;
  isDemo: boolean;
}

export type CommunicationStyle = "concise" | "supportive" | "direct";

export interface UserPreferences {
  preferredSessionTime: string; // "HH:mm", 24h local time
  preferredDurationMinutes: number;
  communicationStyle: CommunicationStyle;
  reminderEnabled: boolean;
}

export type AutonomyLevel = "conservative" | "balanced" | "autonomous";

export interface AgentPermissions {
  canCreateReminders: boolean;
  canModifyPlans: boolean;
  canScheduleFollowups: boolean;
  requireApprovalForExternalActions: boolean;
}

export interface UserSettings {
  autonomyLevel: AutonomyLevel;
  permissions: AgentPermissions;
  geminiModel: string;
}

export interface UserRecord {
  profile: UserProfile;
  preferences: UserPreferences;
  settings: UserSettings;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export type MemoryType =
  | "preference"
  | "pattern"
  | "goal"
  | "outcome"
  | "context";

export interface Memory {
  id: ID;
  userId: ID;
  type: MemoryType;
  content: string;
  confidence: number; // 0..1
  source: "user_statement" | "inferred" | "seed";
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export type PlanStatus = "active" | "paused" | "completed" | "archived";

export type PlanFrequency = string; // e.g. "Mon-Fri", "Mon,Wed,Fri"

export interface PlanSchedule {
  daysOfWeek: number[]; // 0=Sunday..6=Saturday
  time: string; // "HH:mm"
}

export interface Plan {
  id: ID;
  userId: ID;
  title: string;
  goal: string;
  description: string;
  schedule: PlanSchedule;
  durationMinutes: number;
  frequencyLabel: PlanFrequency;
  status: PlanStatus;
  version: number;
  successMetrics: string[];
  checkinFrequencyDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanVersionChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface PlanVersion {
  id: ID;
  userId: ID;
  planId: ID;
  version: number;
  snapshot: Omit<Plan, "id">;
  changes: PlanVersionChange[];
  reason: string;
  evidenceIds: string[];
  createdAt: string;
  createdBy: "user" | "agent";
}

// ---------------------------------------------------------------------------
// Events (behavioral + audit trail — powers both Progress and Activity)
// ---------------------------------------------------------------------------

export type EventType =
  | "SESSION_COMPLETED"
  | "SESSION_MISSED"
  | "AGENT_STARTED"
  | "CONTEXT_RETRIEVED"
  | "PLAN_PROPOSED"
  | "APPROVAL_REQUESTED"
  | "ACTION_APPROVED"
  | "ACTION_REJECTED"
  | "PLAN_CREATED"
  | "PLAN_UPDATED"
  | "CHECKIN_SCHEDULED"
  | "CHECKIN_COMPLETED"
  | "MEMORY_CREATED"
  | "MEMORY_UPDATED"
  | "MEMORY_DELETED"
  | "MESSAGE_SENT"
  | "AGENT_COMPLETED"
  | "AGENT_FAILED";

export interface EventRecord {
  id: ID;
  userId: ID;
  type: EventType;
  timestamp: string;
  source: "user" | "agent" | "system" | "background";
  payload: Record<string, unknown>;
  summary: string;
}

// ---------------------------------------------------------------------------
// Agent runs
// ---------------------------------------------------------------------------

export type AgentRunStatus = "running" | "completed" | "failed";

export interface AgentRunStep {
  label: string;
  detail?: string;
  completedAt: string;
}

export interface AgentRunActionRef {
  actionId: ID;
  type: string;
  status: string;
}

export interface AgentRun {
  id: ID;
  userId: ID;
  conversationId: ID;
  trigger: "user_message" | "background_checkin";
  input: string;
  status: AgentRunStatus;
  provider: "gemini" | "demo";
  steps: AgentRunStep[];
  planSummary: string | null;
  actions: AgentRunActionRef[];
  resultSummary: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Actions (proposed / executed changes, gated by policy + approval)
// ---------------------------------------------------------------------------

export type ActionType =
  | "CREATE_PLAN"
  | "MODIFY_PLAN"
  | "SCHEDULE_CHECKIN"
  | "CREATE_MEMORY"
  | "UPDATE_MEMORY"
  | "DELETE_MEMORY"
  | "RECORD_EVENT"
  | "SEND_EXTERNAL_MESSAGE"
  | "HIGH_RISK_HEALTH_ACTION";

export type ActionStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type RiskLevel = "low" | "medium" | "high" | "prohibited";

export interface AgentAction {
  id: ID;
  userId: ID;
  type: ActionType;
  parameters: Record<string, unknown>;
  reason: string;
  evidenceIds: string[];
  riskLevel: RiskLevel;
  status: ActionStatus;
  approvalRequired: boolean;
  approvedAt: string | null;
  rejectedAt: string | null;
  executedAt: string | null;
  idempotencyKey: string;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export type CheckinStatus = "pending" | "completed" | "skipped";

export interface CheckIn {
  id: ID;
  userId: ID;
  planId: ID | null;
  scheduledAt: string;
  completedAt: string | null;
  status: CheckinStatus;
  message: string;
  response: string | null;
  createdBy: "user" | "agent";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "agent" | "system";

export interface ConversationMessageCard {
  kind: "plan_proposal" | "action_approval" | "evidence" | "progress_summary";
  data: Record<string, unknown>;
}

export interface ConversationMessage {
  id: ID;
  conversationId: ID;
  role: MessageRole;
  content: string;
  cards: ConversationMessageCard[];
  createdAt: string;
  metadata: {
    runId?: ID;
    evidenceIds?: string[];
  };
}

export interface Conversation {
  id: ID;
  userId: ID;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Evidence (§54)
// ---------------------------------------------------------------------------

export interface Evidence {
  id: string;
  type: "adherence_stat" | "preference" | "streak" | "trend";
  label: string;
  value: string;
  source: "events" | "memory" | "plan";
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Progress engine output (§53)
// ---------------------------------------------------------------------------

export interface DayOutcome {
  date: string; // ISO date, yyyy-MM-dd
  status: "completed" | "missed" | "scheduled" | "no_session";
  durationMinutes: number | null;
}

export interface ProgressSnapshot {
  completionRate: number; // 0..1 over the window
  streakDays: number;
  weeklyPlanned: number;
  weeklyCompleted: number;
  weeklyCompletionRate: number;
  averageDurationMinutes: number;
  trend: "improving" | "declining" | "stable";
  completionByDuration: { durationMinutes: number; completionRate: number; sampleSize: number }[];
  timeline: DayOutcome[];
}
