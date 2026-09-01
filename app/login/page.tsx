"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/apiClient";
import { isFirebaseClientConfigured, signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/lib/auth/firebaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [checkedConfig, setCheckedConfig] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const firebaseReady = isFirebaseClientConfigured();

  useEffect(() => {
    api
      .get<{ demoModeEnabled: boolean }>("/api/auth/config")
      .then((cfg) => setDemoModeEnabled(cfg.demoModeEnabled))
      .finally(() => setCheckedConfig(true));
  }, []);

  async function afterSignIn() {
    router.replace("/dashboard");
    router.refresh();
  }

  async function handleDemo() {
    setError(null);
    setLoading("demo");
    try {
      await api.post("/api/auth/session", { demo: true });
      await afterSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the demo.");
    } finally {
      setLoading(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading("google");
    try {
      const idToken = await signInWithGoogle();
      await api.post("/api/auth/session", { idToken });
      await afterSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");
    try {
      const idToken = mode === "sign-in" ? await signInWithEmail(email, password) : await signUpWithEmail(email, password);
      await api.post("/api/auth/session", { idToken, email });
      await afterSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-[#0b1120]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-700 text-lg font-semibold text-white">C</span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Continuum</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your persistent wellbeing planning agent.</p>
          </div>
        </div>

        <Card>
          {firebaseReady && (
            <>
              <Button variant="secondary" className="w-full" onClick={handleGoogle} disabled={loading !== null}>
                {loading === "google" ? "Signing in…" : "Continue with Google"}
              </Button>

              <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                or
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <form onSubmit={handleEmail} className="flex flex-col gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <Button type="submit" className="w-full" disabled={loading !== null}>
                  {loading === "email" ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
                </Button>
              </form>
              <button
                className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              >
                {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </>
          )}

          {checkedConfig && demoModeEnabled && (
            <>
              {firebaseReady && (
                <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  or
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
              )}
              <Button variant={firebaseReady ? "secondary" : "primary"} className="w-full" onClick={handleDemo} disabled={loading !== null}>
                {loading === "demo" ? "Starting demo…" : "Continue in Demo Mode"}
              </Button>
              <p className="mt-2 text-center text-xs text-slate-400">Explores Continuum with seeded sample data — no account needed.</p>
            </>
          )}

          {checkedConfig && !demoModeEnabled && !firebaseReady && (
            <p className="text-center text-sm text-rose-600 dark:text-rose-400">
              No sign-in method is configured. Set Firebase credentials or DEMO_MODE=true.
            </p>
          )}

          {error && <p className="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </Card>
      </div>
    </div>
  );
}
