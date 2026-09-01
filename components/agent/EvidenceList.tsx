import type { Evidence } from "@/lib/types";

/** §26/§54: the decision evidence shown instead of hidden chain-of-thought. */
export function EvidenceList({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Decision evidence</p>
      <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
        {items.map((e) => (
          <li key={e.id}>
            • {e.label}: {e.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
