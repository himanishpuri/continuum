import { z } from "genkit";
import type { ActionType } from "@/lib/types";

/**
 * The controlled tool registry (§19). Each entry documents the contract a
 * proposed action must satisfy — name, description, input schema, and the
 * ActionType that routes it through the policy engine and executor
 * (lib/tools/actionService.ts, lib/tools/toolExecutor.ts). The model never
 * calls these directly; it proposes a single structured `AgentDecision`,
 * and decisionEngine.ts validates any `proposedAction.parameters` against
 * the matching schema here before it's allowed anywhere near execution
 * (§18 — never execute malformed model output).
 */
export interface ToolMetadata {
  name: string;
  description: string;
  actionType: ActionType;
  inputSchema: z.ZodTypeAny;
}

export const TOOL_REGISTRY: ToolMetadata[] = [
  {
    name: "create_plan",
    description: "Creates a brand-new plan when the user has none yet.",
    actionType: "CREATE_PLAN",
    inputSchema: z.object({
      title: z.string(),
      goal: z.string(),
      description: z.string().optional(),
      durationMinutes: z.number().positive(),
      daysOfWeek: z.array(z.number().min(0).max(6)),
      time: z.string(),
      reason: z.string(),
    }),
  },
  {
    name: "update_plan",
    description: "Proposes a change to the user's existing active plan.",
    actionType: "MODIFY_PLAN",
    inputSchema: z.object({
      planId: z.string().optional(),
      durationMinutes: z.number().positive().optional(),
      daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
      time: z.string().optional(),
      reason: z.string(),
    }),
  },
  {
    name: "schedule_checkin",
    description: "Schedules a future follow-up check-in with the user.",
    actionType: "SCHEDULE_CHECKIN",
    inputSchema: z.object({
      scheduledAt: z.string(),
      message: z.string(),
      planId: z.string().nullable().optional(),
    }),
  },
  {
    name: "record_event",
    description: "Records a self-reported session outcome (completed or missed).",
    actionType: "RECORD_EVENT",
    inputSchema: z.object({
      eventType: z.enum(["SESSION_COMPLETED", "SESSION_MISSED"]),
      durationMinutes: z.number().optional(),
      timestamp: z.string().optional(),
      summary: z.string(),
    }),
  },
  {
    name: "create_memory",
    description: "Remembers a durable preference, goal, or pattern for future conversations.",
    actionType: "CREATE_MEMORY",
    inputSchema: z.object({
      type: z.enum(["preference", "pattern", "goal", "outcome", "context"]),
      content: z.string(),
      confidence: z.number().min(0).max(1),
      expiresInDays: z.number().nullable().optional(),
    }),
  },
  {
    name: "update_memory",
    description: "Refines an existing memory's wording or confidence.",
    actionType: "UPDATE_MEMORY",
    inputSchema: z.object({
      memoryId: z.string(),
      content: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }),
  },
];

export function findToolByActionType(actionType: ActionType): ToolMetadata | undefined {
  return TOOL_REGISTRY.find((t) => t.actionType === actionType);
}

function fieldNames(schema: z.ZodTypeAny): { required: string[]; optional: string[] } {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
  const required: string[] = [];
  const optional: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    ((value as z.ZodTypeAny).isOptional() ? optional : required).push(key);
  }
  return { required, optional };
}

/**
 * Rendered into the decision prompt so the model knows the exact parameter
 * contract for each action it can propose — without this it fills
 * `proposedAction.parameters` blind and the schema check downstream
 * silently drops the proposal.
 */
export function describeToolCatalog(): string {
  const lines = TOOL_REGISTRY.map((t) => {
    const { required, optional } = fieldNames(t.inputSchema);
    const params = [...required.map((f) => f), ...optional.map((f) => `${f}?`)].join(", ");
    return `- ${t.actionType}: ${t.description}\n  parameters: { ${params} }`;
  });
  return [
    lines.join("\n"),
    "",
    "Parameter conventions:",
    "- daysOfWeek: integer array, 0=Sunday … 6=Saturday (e.g. Mon/Wed/Fri = [1,3,5]).",
    "- time: 24-hour \"HH:MM\" (e.g. 6:00 PM = \"18:00\").",
    "- durationMinutes: a positive integer; if the user gives a distance or open-ended goal, pick a reasonable session length and say so in the summary.",
    "- Fill EVERY required parameter when proposing an action. Infer sensible values for anything the user didn't state rather than omitting it.",
  ].join("\n");
}
