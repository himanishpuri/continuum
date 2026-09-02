import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { sendAgentMessage } from "@/lib/agent/agentService";
import { checkRateLimit } from "@/lib/util/rateLimit";

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const rate = checkRateLimit(`agent:${auth.user.uid}`, 15, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ error: "You're sending messages too fast — give it a moment." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A non-empty message is required." }, { status: 400 });
  }

  try {
    const result = await sendAgentMessage(auth.user.uid, parsed.data.message, parsed.data.conversationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Agent message failed", err);
    return NextResponse.json({ error: "I couldn't complete that just now. Nothing was changed." }, { status: 500 });
  }
}
