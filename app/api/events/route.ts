import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { checkRateLimit } from "@/lib/util/rateLimit";

const BodySchema = z.object({
  type: z.enum(["SESSION_COMPLETED", "SESSION_MISSED"]),
  durationMinutes: z.number().positive().max(1440).optional(),
  timestamp: z.string().optional(),
  summary: z.string().max(500).optional(),
});

/** Client-supplied timestamp is honoured only if it parses and isn't in the future. */
function resolveTimestamp(raw: string | undefined): string {
  const now = Date.now();
  const parsed = raw ? Date.parse(raw) : NaN;
  return !Number.isNaN(parsed) && parsed <= now + 60_000 ? new Date(parsed).toISOString() : new Date(now).toISOString();
}

/**
 * Direct, user-authenticated logging of a session outcome (e.g. a "mark
 * today complete/missed" control on the Progress page) — allowed
 * unconditionally per the policy table (§20 RECORD_EVENT), so this writes
 * straight to the event log rather than going through action approval.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const rate = checkRateLimit(`events:${auth.user.uid}`, 30, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests — slow down." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { type, durationMinutes, timestamp, summary } = parsed.data;
  const event = await getRepositories().events.create(auth.user.uid, {
    type,
    timestamp: resolveTimestamp(timestamp),
    source: "user",
    payload: { durationMinutes: durationMinutes ?? null, reportedVia: "manual" },
    summary: summary ?? (type === "SESSION_COMPLETED" ? "Session marked complete." : "Session marked missed."),
  });

  return NextResponse.json({ event });
}
