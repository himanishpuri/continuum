import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { deleteMemory, updateMemory } from "@/lib/memory/memoryService";

const PatchSchema = z.object({
  content: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  try {
    const memory = await updateMemory(auth.user.uid, id, parsed.data);
    await getRepositories().events.create(auth.user.uid, {
      type: "MEMORY_UPDATED",
      timestamp: new Date().toISOString(),
      source: "user",
      payload: { memoryId: id },
      summary: `User edited a memory: "${memory.content}"`,
    });
    return NextResponse.json({ memory });
  } catch {
    return NextResponse.json({ error: "Memory not found." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  await deleteMemory(auth.user.uid, id);
  await getRepositories().events.create(auth.user.uid, {
    type: "MEMORY_DELETED",
    timestamp: new Date().toISOString(),
    source: "user",
    payload: { memoryId: id },
    summary: "User deleted a memory.",
  });
  return NextResponse.json({ ok: true });
}
