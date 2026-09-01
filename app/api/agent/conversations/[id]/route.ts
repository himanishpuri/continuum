import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const repos = getRepositories();
  const conversation = await repos.conversations.get(auth.user.uid, id);
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const messages = await repos.conversations.listMessages(auth.user.uid, id);
  return NextResponse.json({ conversation, messages: messages.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) });
}
