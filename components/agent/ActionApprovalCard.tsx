"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { api } from "@/lib/apiClient";

export interface ActionCardData {
  actionId: string;
  actionType: string;
  status: string;
  title: string;
  fields: { label: string; value: string }[];
  reason: string;
  riskLevel: string;
}

const RISK_TONE: Record<string, BadgeTone> = { low: "neutral", medium: "warning", high: "danger", prohibited: "danger" };

/** How a non-pending status reads once the proposal is resolved. */
function resolvedLabel(status: string): { text: string; muted: boolean } {
  switch (status) {
    case "REJECTED":
      return { text: "Not applied", muted: true };
    case "EXPIRED":
      return { text: "Expired — ask the agent again", muted: true };
    case "FAILED":
      return { text: "Couldn't apply", muted: true };
    default:
      return { text: "✓ Applied", muted: false }; // APPROVED / EXECUTING / COMPLETED
  }
}

/** The [Approve] [Reject] proposal card from §8/§9/§21. */
export function ActionApprovalCard({ data }: { data: ActionCardData }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(data.status);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      const res = await api.post<{ action: { status: string } }>(`/api/actions/${data.actionId}/${kind}`);
      setStatus(res.action.status);
      for (const key of ["dashboard", "plans", "progress"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const resolved = status !== "PENDING_APPROVAL";
  const resolvedText = resolvedLabel(status);

  return (
    <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{data.title}</p>
        <Badge tone={RISK_TONE[data.riskLevel] ?? "neutral"}>{data.riskLevel} risk</Badge>
      </div>
      {data.fields.length > 0 && (
        <dl className="mt-2 space-y-1 text-sm">
          {data.fields.map((f) => (
            <div key={f.label} className="flex justify-between gap-3">
              <dt className="text-slate-400">{f.label}</dt>
              <dd className="font-medium text-slate-700 dark:text-slate-300">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{data.reason}</p>

      {!resolved ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => act("approve")} disabled={busy !== null}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => act("reject")} disabled={busy !== null}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      ) : (
        <p className={clsx("mt-3 text-sm font-medium", resolvedText.muted ? "text-slate-500 dark:text-slate-400" : "text-emerald-700 dark:text-emerald-400")}>
          {resolvedText.text}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
