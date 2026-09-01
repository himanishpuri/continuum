"use client";

import { useState } from "react";
import { Trash2, Pencil, Check, X } from "lucide-react";
import type { Memory } from "@/lib/types";

export function MemoryCard({ memory, onDelete, onEdit }: { memory: Memory; onDelete: () => void; onEdit: (content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  return (
    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
      {editing ? (
        <div className="flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            aria-label="Save"
            onClick={() => {
              onEdit(draft);
              setEditing(false);
            }}
            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            aria-label="Cancel"
            onClick={() => {
              setDraft(memory.content);
              setEditing(false);
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-800 dark:text-slate-200">&ldquo;{memory.content}&rdquo;</p>
          <div className="flex shrink-0 gap-1">
            <button
              aria-label="Edit memory"
              onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Delete memory"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>Confidence {Math.round(memory.confidence * 100)}%</span>
        <span>Source: {memory.source.replace("_", " ")}</span>
        <span>Created {new Date(memory.createdAt).toLocaleDateString()}</span>
        <span>Last used {memory.lastUsedAt ? new Date(memory.lastUsedAt).toLocaleDateString() : "never"}</span>
      </div>
    </div>
  );
}
