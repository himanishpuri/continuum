import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const events = await getRepositories().events.list(auth.user.uid, { limit: Number.isFinite(limit) ? limit : 50 });
  return NextResponse.json({ events });
}
