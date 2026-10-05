"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { PlanVersion } from "@/lib/types";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";

function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** §10: version history — click a version to see what changed and why. */
export function PlanVersionTimeline({ versions }: { versions: PlanVersion[] }) {
  const [openVersion, setOpenVersion] = useState<number | null>(versions[0]?.version ?? null);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const restoring = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const latest = Math.max(...versions.map((v) => v.version));

  async function restore() {
    if (restoreVersion === null || restoring.current) return;
    restoring.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/plans/${versions[0].planId}/revert`, { version: restoreVersion });
      for (const key of ["plans", "plan-versions", "dashboard", "progress"]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      setRestoreVersion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't restore this version.");
      setRestoreVersion(null);
    } finally {
      setBusy(false);
      restoring.current = false;
    }
  }

  return (
    <>
    <ol className="space-y-2">
      {versions.map((v) => {
        const open = openVersion === v.version;
        return (
          <li key={v.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
              onClick={() => setOpenVersion(open ? null : v.version)}
              aria-expanded={open}
              aria-controls={`version-panel-${v.id}`}
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                v{v.version} — {v.snapshot.durationMinutes} min / {v.snapshot.frequencyLabel}
              </span>
              <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
            </button>
            <div id={`version-panel-${v.id}`} inert={!open} aria-hidden={!open} className={clsx("overflow-hidden px-3.5 transition-all", open ? "max-h-64 pb-3.5" : "max-h-0")}>
              <p className="text-xs text-slate-500 dark:text-slate-400">{v.reason} · by {v.createdBy === "user" ? "you" : "Continuum"}</p>
              {v.changes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {v.changes.map((c, idx) => (
                    <li key={idx}>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{c.field}</span>: {formatFieldValue(c.from)} → {formatFieldValue(c.to)}
                    </li>
                  ))}
                </ul>
              )}
              {v.version !== latest && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => setRestoreVersion(v.version)} disabled={busy}>
                  Restore this version
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
    {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    <ConfirmationDialog
      open={restoreVersion !== null}
      title={`Restore version ${restoreVersion}?`}
      description="This creates a new version of your plan using the selected version's settings."
      confirmLabel={busy ? "Restoring…" : "Restore plan"}
      onConfirm={restore}
      onCancel={() => setRestoreVersion(null)}
    />
    </>
  );
}
