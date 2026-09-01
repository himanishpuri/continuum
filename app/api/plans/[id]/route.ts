import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const repos = getRepositories();
  const [plan, versions] = await Promise.all([repos.plans.get(auth.user.uid, id), repos.planVersions.listByPlan(auth.user.uid, id)]);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  return NextResponse.json({ plan, versions: versions.sort((a, b) => b.version - a.version) });
}
