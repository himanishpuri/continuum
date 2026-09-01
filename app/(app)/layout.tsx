import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateUser } from "@/lib/services/userService";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect("/login");

  const user = await getOrCreateUser(sessionUser.uid);

  return <AppShell userName={user.profile.name}>{children}</AppShell>;
}
