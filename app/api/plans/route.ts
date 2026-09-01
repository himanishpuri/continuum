import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const plans = await getRepositories().plans.list(auth.user.uid);
  return NextResponse.json({ plans: plans.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)) });
}
