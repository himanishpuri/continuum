import { Check } from "lucide-react";
import type { AgentRunStep } from "@/lib/types";

/**
 * §9: every listed step reflects work the run actually performed
 * (context.ts / the provider / actionService) — nothing here is
 * fabricated progress. Requests complete synchronously, so the steps
 * arrive already finished; the stagger is just a reveal animation.
 */
export function AgentRunTimeline({ steps }: { steps: AgentRunStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      {steps.map((step, idx) => (
        <li key={`${step.label}-${idx}`} className="animate-step-in flex items-center gap-1.5" style={{ animationDelay: `${idx * 80}ms` }}>
          <Check className="h-3 w-3 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
          {step.label}
        </li>
      ))}
    </ul>
  );
}
