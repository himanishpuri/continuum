"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { api } from "@/lib/apiClient";

export function AppShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await api.delete("/api/auth/session");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-950 md:flex">
        <div className="flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white">C</span>
          <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">Continuum</span>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                )}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-200 px-2 pt-4 dark:border-slate-800">
          <span className="truncate text-sm text-slate-500 dark:text-slate-400">{userName}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-900"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">C</span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Continuum</span>
        </div>
        <button onClick={signOut} className="text-xs text-slate-500 dark:text-slate-400" aria-label="Sign out">
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden"
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium",
                active ? "text-teal-700 dark:text-teal-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
