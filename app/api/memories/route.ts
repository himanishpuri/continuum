import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { forgetAllMemories } from "@/lib/memory/memoryService";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const memories = await getRepositories().memories.list(auth.user.uid);
  return NextResponse.json({ memories: memories.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
}

/** "Forget everything" (§12/§14 privacy controls). */
export async function DELETE() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  await forgetAllMemories(auth.user.uid);
  await getRepositories().events.create(auth.user.uid, {
    type: "MEMORY_DELETED",
    timestamp: new Date().toISOString(),
    source: "user",
    payload: { scope: "all" },
    summary: "User deleted all memories.",
  });
  return NextResponse.json({ ok: true });
}
