import { z } from "genkit";

export const MemoryTypeSchema = z.enum([
  "preference",
  "pattern",
  "goal",
  "outcome",
  "context",
]);

/**
 * A memory the agent believes is worth remembering long-term. Not every
 * sentence becomes a memory — the verifier only persists candidates that
 * read as a stable preference, goal, recurring pattern, or important
 * instruction (§25), and it comes back from the model as an empty array in
 * the common case.
 */
export const MemoryCandidateSchema = z.object({
  type: MemoryTypeSchema,
  content: z.string().describe("A short, standalone statement of fact."),
  confidence: z.number().min(0).max(1),
  expiresInDays: z
    .number()
    .nullable()
    .describe("null for a durable fact, a number of days for something time-bound."),
});
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export const MemoryCandidateListSchema = z.array(MemoryCandidateSchema);
