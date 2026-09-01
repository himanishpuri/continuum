import { Check, X, Circle } from "lucide-react";
import type { DayOutcome } from "@/lib/types";

const STATUS_CONFIG = {
  completed: { icon: Check, label: "Completed", className: "text-emerald-700 dark:text-emerald-400" },
  missed: { icon: X, label: "Missed", className: "text-rose-600 dark:text-rose-400" },
  scheduled: { icon: Circle, label: "Scheduled", className: "text-slate-400" },
  no_session: { icon: Circle, label: "No session", className: "text-slate-300 dark:text-slate-600" },
} as const;

export function DayTimeline({ days }: { days: DayOutcome[] }) {
  return (
    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
      {days.map((day) => {
        const config = STATUS_CONFIG[day.status];
        const Icon = config.icon;
        return (
          <li key={day.date} className="flex items-center justify-between py-2.5 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })}
            </span>
            <span className={`flex items-center gap-1.5 ${config.className}`}>
              <Icon className="h-4 w-4" aria-hidden />
              {config.label}
              {day.durationMinutes ? ` · ${day.durationMinutes} min` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
