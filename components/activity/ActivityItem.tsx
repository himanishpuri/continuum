import { CheckCircle2, XCircle, MessageSquare, Brain, CalendarClock, Bell, PlayCircle, AlertTriangle } from "lucide-react";
import type { EventRecord, EventType } from "@/lib/types";

const ICONS: Record<EventType, typeof CheckCircle2> = {
  SESSION_COMPLETED: CheckCircle2,
  SESSION_MISSED: XCircle,
  AGENT_STARTED: PlayCircle,
  CONTEXT_RETRIEVED: PlayCircle,
  PLAN_PROPOSED: MessageSquare,
  APPROVAL_REQUESTED: MessageSquare,
  ACTION_APPROVED: CheckCircle2,
  ACTION_REJECTED: XCircle,
  PLAN_CREATED: CalendarClock,
  PLAN_UPDATED: CalendarClock,
  CHECKIN_SCHEDULED: Bell,
  CHECKIN_COMPLETED: CheckCircle2,
  MEMORY_CREATED: Brain,
  MEMORY_UPDATED: Brain,
  MEMORY_DELETED: Brain,
  MESSAGE_SENT: Bell,
  AGENT_COMPLETED: CheckCircle2,
  AGENT_FAILED: AlertTriangle,
};

const TONE: Record<EventType, string> = {
  SESSION_COMPLETED: "text-emerald-600 dark:text-emerald-400",
  SESSION_MISSED: "text-rose-600 dark:text-rose-400",
  AGENT_STARTED: "text-slate-400",
  CONTEXT_RETRIEVED: "text-slate-400",
  PLAN_PROPOSED: "text-teal-600 dark:text-teal-400",
  APPROVAL_REQUESTED: "text-amber-600 dark:text-amber-400",
  ACTION_APPROVED: "text-emerald-600 dark:text-emerald-400",
  ACTION_REJECTED: "text-slate-500",
  PLAN_CREATED: "text-teal-600 dark:text-teal-400",
  PLAN_UPDATED: "text-teal-600 dark:text-teal-400",
  CHECKIN_SCHEDULED: "text-amber-600 dark:text-amber-400",
  CHECKIN_COMPLETED: "text-emerald-600 dark:text-emerald-400",
  MEMORY_CREATED: "text-indigo-600 dark:text-indigo-400",
  MEMORY_UPDATED: "text-indigo-600 dark:text-indigo-400",
  MEMORY_DELETED: "text-slate-500",
  MESSAGE_SENT: "text-amber-600 dark:text-amber-400",
  AGENT_COMPLETED: "text-emerald-600 dark:text-emerald-400",
  AGENT_FAILED: "text-rose-600 dark:text-rose-400",
};

function humanizeEventType(type: EventType): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function ActivityItem({ event }: { event: EventRecord }) {
  const Icon = ICONS[event.type];
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${TONE[event.type]}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm text-slate-800 dark:text-slate-200">{event.summary}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {humanizeEventType(event.type)} · {new Date(event.timestamp).toLocaleString()} · {event.source}
        </p>
      </div>
    </li>
  );
}
