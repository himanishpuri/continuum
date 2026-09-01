import type { Memory } from "@/lib/types";
import type { MemoryCandidate } from "../schemas/memorySchemas";

const MIN_CONFIDENCE = 0.6;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function isSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const wordsA = new Set(na.split(/\s+/).filter(Boolean));
  const wordsB = nb.split(/\s+/).filter(Boolean);
  if (wordsB.length === 0) return false;
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / wordsB.length > 0.7;
}

/**
 * VERIFY (§17/§25): decides which of the model's memory candidates are
 * actually worth persisting. Deterministic on purpose — a confidence
 * floor plus a near-duplicate check against what the user already has,
 * rather than trusting the model's own judgment unchecked.
 */
export function selectMemoriesToPersist(candidates: MemoryCandidate[], existing: Memory[]): MemoryCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.confidence < MIN_CONFIDENCE) return false;
    const isDuplicate = existing.some((m) => m.type === candidate.type && isSimilar(m.content, candidate.content));
    return !isDuplicate;
  });
}
