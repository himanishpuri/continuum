"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

type PushState = "loading" | "unsupported" | "denied" | "off" | "on";

function applicationServerKey(key: string): ArrayBuffer {
  const base64 = (key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer as ArrayBuffer;
}

export function PushControls() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !key) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") { setState("denied"); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        setState(subscription ? "on" : "off");
      } catch { setState("off"); }
    });
  }, [key]);

  async function enable() {
    if (!key) return;
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: applicationServerKey(key),
      });
      await api.post("/api/push/subscribe", subscription.toJSON());
      setState("on");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't enable notifications.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.delete("/api/push/subscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't disable notifications.");
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{ delivered: boolean }>("/api/push/test");
      setMessage(result.delivered ? "Test notification sent." : "No device accepted the test notification.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't send a test notification.");
    } finally { setBusy(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Notifications on this device</CardTitle></CardHeader>
    <p className="text-sm text-slate-600 dark:text-slate-400">
      {state === "loading" && "Checking notification support…"}
      {state === "unsupported" && "Push notifications are unavailable in this browser or have not been configured."}
      {state === "denied" && "Notifications are blocked. Allow them in your browser settings to enable this device."}
      {state === "off" && "Notifications are not enabled on this device."}
      {state === "on" && "Notifications are enabled on this device."}
    </p>
    <p className="mt-1 text-xs text-slate-500">On iPhone or iPad, add Continuum to your Home Screen before enabling notifications.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {state === "off" && <Button size="sm" onClick={enable} disabled={busy}>Enable</Button>}
      {state === "on" && <>
        <Button size="sm" variant="secondary" onClick={disable} disabled={busy}>Disable</Button>
        <Button size="sm" variant="secondary" onClick={test} disabled={busy}>Send test notification</Button>
      </>}
    </div>
    {message && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{message}</p>}
  </Card>;
}
