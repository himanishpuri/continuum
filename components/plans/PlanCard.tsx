import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import type { Plan } from "@/lib/types";

const STATUS_TONE: Record<Plan["status"], BadgeTone> = {
  active: "success",
  paused: "warning",
  completed: "info",
  archived: "neutral",
};

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function PlanCard({ plan, compact = false }: { plan: Plan; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{compact ? "Current plan" : plan.title}</CardTitle>
        <Badge tone={STATUS_TONE[plan.status]}>{plan.status}</Badge>
      </CardHeader>
      {compact ? (
        <p className="text-sm text-slate-700 dark:text-slate-300">{plan.title}</p>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Goal</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{plan.goal}</p>
        </>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Duration</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200">{plan.durationMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Schedule</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200">
            {plan.frequencyLabel} · {formatTime(plan.schedule.time)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Version</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200">v{plan.version}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Check-ins</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200">Every {plan.checkinFrequencyDays} days</dd>
        </div>
      </dl>
    </Card>
  );
}
