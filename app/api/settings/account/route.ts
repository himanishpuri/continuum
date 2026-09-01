import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { deleteAllUserData } from "@/lib/repositories";
import { clearSession } from "@/lib/auth/session";
import { isFirebaseAdminConfigured } from "@/lib/auth/firebaseAdmin";

/** §14: full account deletion — wipes all app data and, outside demo mode, the Firebase Auth user itself. */
export async function DELETE() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  await deleteAllUserData(auth.user.uid);

  if (!auth.user.isDemo && isFirebaseAdminConfigured()) {
    const { getAdminAuth } = await import("@/lib/auth/firebaseAdmin");
    await getAdminAuth()
      .deleteUser(auth.user.uid)
      .catch(() => undefined);
  }

  await clearSession();
  return NextResponse.json({ ok: true });
}
