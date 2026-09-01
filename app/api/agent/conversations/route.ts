import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const conversations = await getRepositories().conversations.list(auth.user.uid);
  return NextResponse.json({ conversations: conversations.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)) });
}
