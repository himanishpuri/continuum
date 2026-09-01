import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { runId } = await params;
  const run = await getRepositories().agentRuns.get(auth.user.uid, runId);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run });
}
