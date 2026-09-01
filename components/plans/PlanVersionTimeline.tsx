"use client";

import { useState } from "react";
import clsx from "clsx";
import type { PlanVersion } from "@/lib/types";

function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** §10: version history — click a version to see what changed and why. */
export function PlanVersionTimeline({ versions }: { versions: PlanVersion[] }) {
  const [openVersion, setOpenVersion] = useState<number | null>(versions[0]?.version ?? null);

  return (
    <ol className="space-y-2">
      {versions.map((v) => {
        const open = openVersion === v.version;
        return (
          <li key={v.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
              onClick={() => setOpenVersion(open ? null : v.version)}
              aria-expanded={open}
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                v{v.version} — {v.snapshot.durationMinutes} min / {v.snapshot.frequencyLabel}
              </span>
              <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
            </button>
            <div className={clsx("overflow-hidden px-3.5 transition-all", open ? "max-h-64 pb-3.5" : "max-h-0")}>
              <p className="text-xs text-slate-500 dark:text-slate-400">{v.reason}</p>
              {v.changes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {v.changes.map((c, idx) => (
                    <li key={idx}>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{c.field}</span>: {formatFieldValue(c.from)} → {formatFieldValue(c.to)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
