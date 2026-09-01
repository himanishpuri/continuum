import { NextResponse } from "next/server";
import { z } from "genkit";
import { clearSession, createDemoSession, createFirebaseSession, DEMO_USER_ID } from "@/lib/auth/session";
import { getOrCreateUser } from "@/lib/services/userService";

const BodySchema = z.object({
  demo: z.boolean().optional(),
  idToken: z.string().optional(),
  name: z.string().optional(),
  email: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { demo, idToken, name, email } = parsed.data;

  try {
    if (demo) {
      if (process.env.DEMO_MODE !== "true") {
        return NextResponse.json({ error: "Demo mode is not enabled on this server." }, { status: 403 });
      }
      await createDemoSession();
      await getOrCreateUser(DEMO_USER_ID);
      return NextResponse.json({ ok: true, uid: DEMO_USER_ID });
    }

    if (idToken) {
      const user = await createFirebaseSession(idToken);
      await getOrCreateUser(user.uid, { name, email: email ?? null });
      return NextResponse.json({ ok: true, uid: user.uid });
    }

    return NextResponse.json({ error: "Provide either demo or idToken." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
