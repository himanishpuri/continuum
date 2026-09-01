import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import type { ConversationMessage } from "@/lib/types";

const ACTION_CARD_KINDS = new Set(["plan_proposal", "action_approval"]);

/**
 * Proposal cards are written once with `status: "PENDING_APPROVAL"` and never
 * mutated. Re-derive each card's status from the live `actions` row on read so
 * an already-approved/rejected proposal doesn't show the buttons again after a
 * reload (mirrors how the dashboard recommendation stays fresh).
 */
async function reconcileCardStatus(userId: string, messages: ConversationMessage[]): Promise<ConversationMessage[]> {
  const repos = getRepositories();
  const actionIds = new Set<string>();
  for (const m of messages) {
    for (const c of m.cards) {
      if (ACTION_CARD_KINDS.has(c.kind) && typeof c.data.actionId === "string") actionIds.add(c.data.actionId);
    }
  }
  if (actionIds.size === 0) return messages;

  const statuses = new Map<string, string>();
  await Promise.all(
    [...actionIds].map(async (actionId) => {
      const action = await repos.actions.get(userId, actionId);
      if (action) statuses.set(actionId, action.status);
    })
  );

  return messages.map((m) => ({
    ...m,
    cards: m.cards.map((c) => {
      const live = typeof c.data.actionId === "string" ? statuses.get(c.data.actionId) : undefined;
      return live && live !== c.data.status ? { ...c, data: { ...c.data, status: live } } : c;
    }),
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const repos = getRepositories();
  const conversation = await repos.conversations.get(auth.user.uid, id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const messages = await repos.conversations.listMessages(auth.user.uid, id);
  messages.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return NextResponse.json({ conversation, messages: await reconcileCardStatus(auth.user.uid, messages) });
}
