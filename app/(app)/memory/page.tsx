"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { MemoryCard } from "@/components/memory/MemoryCard";
import type { Memory, MemoryType } from "@/lib/types";

const CATEGORY_ORDER: { type: MemoryType; label: string }[] = [
  { type: "preference", label: "Preferences" },
  { type: "pattern", label: "Patterns" },
  { type: "goal", label: "Goals" },
  { type: "outcome", label: "Past outcomes" },
  { type: "context", label: "Important context" },
];

export default function MemoryPage() {
  const queryClient = useQueryClient();
  const [confirmForgetAll, setConfirmForgetAll] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["memories"],
    queryFn: () => api.get<{ memories: Memory[] }>("/api/memories"),
  });

  async function deleteMemory(id: string) {
    await api.delete(`/api/memories/${id}`);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }

  async function editMemory(id: string, content: string) {
    await api.patch(`/api/memories/${id}`, { content });
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }

  async function confirmMemory(id: string) {
    await api.patch(`/api/memories/${id}`, { status: "active" });
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }

  async function forgetAll() {
    await api.delete("/api/memories");
    setConfirmForgetAll(false);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }

  if (isLoading) return <LoadingState label="Loading memory…" />;
  if (isError || !data) return <ErrorState message="Couldn't load memory." onRetry={() => refetch()} />;

  const memories = data.memories;
  const pendingMemories = memories.filter((m) => m.status === "pending");
  const activeMemories = memories.filter((m) => m.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Memory</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What Continuum remembers about you — you&apos;re always in control of it.</p>
        </div>
        {memories.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmForgetAll(true)}>
            Forget everything
          </Button>
        )}
      </div>

      {pendingMemories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs your review</CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">Continuum suggested these from your conversations. They aren&apos;t used until you confirm them.</p>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {pendingMemories.map((m) => (
              <MemoryCard key={m.id} memory={m} onConfirm={() => confirmMemory(m.id)} onDelete={() => deleteMemory(m.id)} onEdit={(content) => editMemory(m.id, content)} />
            ))}
          </div>
        </Card>
      )}

      {memories.length === 0 ? (
        <EmptyState title="No memories yet" description="As you talk with Continuum, durable preferences, goals, and patterns it learns about you will show up here." />
      ) : (
        CATEGORY_ORDER.map(({ type, label }) => {
          const items = activeMemories.filter((m) => m.type === type);
          if (items.length === 0) return null;
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-2">
                {items.map((m) => (
                  <MemoryCard key={m.id} memory={m} onDelete={() => deleteMemory(m.id)} onEdit={(content) => editMemory(m.id, content)} />
                ))}
              </div>
            </Card>
          );
        })
      )}

      <ConfirmationDialog
        open={confirmForgetAll}
        title="Forget everything?"
        description="This permanently deletes every memory Continuum has about you. This cannot be undone."
        confirmLabel="Forget everything"
        destructive
        onConfirm={forgetAll}
        onCancel={() => setConfirmForgetAll(false)}
      />
    </div>
  );
}
