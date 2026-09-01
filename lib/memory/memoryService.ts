import { getRepositories } from "@/lib/repositories";
import type { Memory, MemoryType } from "@/lib/types";

const DEFAULT_LIMIT = 8;
const RECENCY_HALFLIFE_DAYS = 30;

export interface MemoryRetrievalOptions {
  types?: MemoryType[];
  limit?: number;
}

function score(memory: Memory, now: number): number {
  const ageDays = (now - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const recency = Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS);
  const usageBoost = memory.lastUsedAt ? 0.1 : 0;
  return memory.confidence * 0.6 + recency * 0.3 + usageBoost;
}

/**
 * The memory retrieval abstraction from §16: never hands the whole
 * database to the model. It reads recent memories, optionally filtered by
 * type, drops anything expired, ranks by a confidence/recency score, and
 * caps how much context comes back.
 */
export async function retrieveRelevantMemories(userId: string, opts: MemoryRetrievalOptions = {}): Promise<Memory[]> {
  const repos = getRepositories();
  let memories = opts.types
    ? (await Promise.all(opts.types.map((t) => repos.memories.listByType(userId, t)))).flat()
    : await repos.memories.list(userId);

  const now = Date.now();
  memories = memories.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);
  const ranked = [...memories].sort((a, b) => score(b, now) - score(a, now));
  return ranked.slice(0, opts.limit ?? DEFAULT_LIMIT);
}

export interface CreateMemoryInput {
  type: MemoryType;
  content: string;
  confidence: number;
  source: Memory["source"];
  expiresInDays?: number | null;
}

/**
 * Only call this for memory candidates that already passed the "is this
 * worth remembering" filter (§25) — an explicit preference, a stable goal,
 * a recurring pattern, or an important instruction. Not every sentence.
 */
export async function createMemory(userId: string, input: CreateMemoryInput): Promise<Memory> {
  const now = new Date();
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return getRepositories().memories.create(userId, {
    type: input.type,
    content: input.content,
    confidence: input.confidence,
    source: input.source,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt,
  });
}

export async function updateMemory(
  userId: string,
  id: string,
  patch: Partial<Pick<Memory, "content" | "confidence" | "type">>
): Promise<Memory> {
  return getRepositories().memories.update(userId, id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  await getRepositories().memories.delete(userId, id);
}

export async function forgetAllMemories(userId: string): Promise<void> {
  await getRepositories().memories.deleteAll(userId);
}

/** Marks memories as used in a decision — drives the "last used" column and memory transparency UI (§26). */
export async function recordMemoryUsage(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await getRepositories().memories.markUsed(userId, ids);
}

const TYPE_LABELS: Record<MemoryType, string> = {
  preference: "Preferences",
  pattern: "Patterns",
  goal: "Goals",
  outcome: "Past outcomes",
  context: "Important context",
};

/** Short, model-context-friendly summary of a memory set, grouped by category. */
export function summarizeMemories(memories: Memory[]): string {
  if (memories.length === 0) return "No relevant memories yet.";
  const byType = new Map<MemoryType, string[]>();
  for (const m of memories) {
    const list = byType.get(m.type) ?? [];
    list.push(m.content);
    byType.set(m.type, list);
  }
  return Array.from(byType.entries())
    .map(([type, contents]) => `${TYPE_LABELS[type]}: ${contents.join("; ")}`)
    .join("\n");
}
