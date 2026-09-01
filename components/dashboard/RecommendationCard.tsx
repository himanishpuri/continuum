"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ActionProposal } from "@/src/ai/schemas/actionSchemas";
import type { Evidence } from "@/lib/types";

export function RecommendationCard({
  summary,
  evidence,
  proposedAction,
  onApply,
  applying,
  applied,
}: {
  summary: string;
  evidence: Evidence[];
  proposedAction: ActionProposal | null;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent recommendation</CardTitle>
      </CardHeader>
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{summary}</p>

      {showEvidence && evidence.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-400">
          {evidence.map((e) => (
            <li key={e.id}>
              • {e.label}: {e.value}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? "Hide reasoning summary" : "Why this recommendation?"}
        </Button>
        {proposedAction && !applied && (
          <Button size="sm" onClick={onApply} disabled={applying}>
            {applying ? "Applying…" : "Apply recommendation"}
          </Button>
        )}
        {applied && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">✓ Applied</span>}
      </div>
    </Card>
  );
}
