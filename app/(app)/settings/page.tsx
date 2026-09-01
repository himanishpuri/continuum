"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import type { AgentPermissions, AutonomyLevel, CommunicationStyle, UserRecord } from "@/lib/types";

function SectionSaveNote({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Saved ✓</span>;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<UserRecord>("/api/settings") });

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [preferredSessionTime, setPreferredSessionTime] = useState("19:00");
  const [preferredDurationMinutes, setPreferredDurationMinutes] = useState(15);
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyle>("supportive");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [permissions, setPermissions] = useState<AgentPermissions | null>(null);
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("balanced");
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate the editable form fields from the loaded record exactly once,
  // by adjusting state during render (React's recommended alternative to
  // an effect here) rather than after an extra post-mount render.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (data && hydratedFor !== data.profile.uid) {
    setHydratedFor(data.profile.uid);
    setName(data.profile.name);
    setTimezone(data.profile.timezone);
    setPreferredSessionTime(data.preferences.preferredSessionTime);
    setPreferredDurationMinutes(data.preferences.preferredDurationMinutes);
    setCommunicationStyle(data.preferences.communicationStyle);
    setReminderEnabled(data.preferences.reminderEnabled);
    setPermissions(data.settings.permissions);
    setAutonomyLevel(data.settings.autonomyLevel);
  }

  function flashSaved(section: string) {
    setSavedSection(section);
    setTimeout(() => setSavedSection((s) => (s === section ? null : s)), 2000);
  }

  async function saveProfile() {
    await api.patch("/api/settings", { profile: { name, timezone } });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    flashSaved("profile");
  }

  async function savePreferences() {
    await api.patch("/api/settings", { preferences: { preferredSessionTime, preferredDurationMinutes, communicationStyle, reminderEnabled } });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    flashSaved("preferences");
  }

  async function savePermissions() {
    if (!permissions) return;
    await api.patch("/api/settings", { settings: { permissions, autonomyLevel } });
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    flashSaved("permissions");
  }

  function exportData() {
    window.open("/api/export", "_blank");
  }

  async function deleteAccount() {
    await api.delete("/api/settings/account");
    router.replace("/login");
  }

  if (isLoading) return <LoadingState label="Loading settings…" />;
  if (isError || !data) return <ErrorState message="Couldn't load settings." onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control how Continuum communicates, what it&apos;s allowed to do, and your data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <SectionSaveNote saved={savedSection === "profile"} />
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Timezone">
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Button size="sm" className="mt-4" onClick={saveProfile}>
          Save profile
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <SectionSaveNote saved={savedSection === "preferences"} />
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred session time">
            <input type="time" value={preferredSessionTime} onChange={(e) => setPreferredSessionTime(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Preferred duration (minutes)">
            <input
              type="number"
              min={5}
              max={120}
              value={preferredDurationMinutes}
              onChange={(e) => setPreferredDurationMinutes(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Communication style">
            <select value={communicationStyle} onChange={(e) => setCommunicationStyle(e.target.value as CommunicationStyle)} className={inputClass}>
              <option value="supportive">Supportive</option>
              <option value="concise">Concise</option>
              <option value="direct">Direct</option>
            </select>
          </Field>
          <Field label="Reminders">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} className="h-4 w-4 rounded" />
              Enable check-in reminders
            </label>
          </Field>
        </div>
        <Button size="sm" className="mt-4" onClick={savePreferences}>
          Save preferences
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent permissions &amp; autonomy</CardTitle>
          <SectionSaveNote saved={savedSection === "permissions"} />
        </CardHeader>
        {permissions && (
          <div className="flex flex-col gap-2">
            <Toggle
              label="Can create reminders"
              checked={permissions.canCreateReminders}
              onChange={(v) => setPermissions({ ...permissions, canCreateReminders: v })}
            />
            <Toggle label="Can modify plans" checked={permissions.canModifyPlans} onChange={(v) => setPermissions({ ...permissions, canModifyPlans: v })} />
            <Toggle
              label="Can schedule follow-ups"
              checked={permissions.canScheduleFollowups}
              onChange={(v) => setPermissions({ ...permissions, canScheduleFollowups: v })}
            />
            <Toggle
              label="Require approval for external actions"
              checked={permissions.requireApprovalForExternalActions}
              onChange={(v) => setPermissions({ ...permissions, requireApprovalForExternalActions: v })}
            />
          </div>
        )}
        <Field label="Autonomy level" className="mt-4 max-w-xs">
          <select value={autonomyLevel} onChange={(e) => setAutonomyLevel(e.target.value as AutonomyLevel)} className={inputClass}>
            <option value="conservative">Conservative — I approve most actions</option>
            <option value="balanced">Balanced — low-risk actions automatic</option>
            <option value="autonomous">Autonomous — recurring low-risk actions automatic</option>
          </select>
        </Field>
        <p className="mt-2 text-xs text-slate-400">Consequential changes like plan modifications always require your approval, regardless of autonomy level.</p>
        <Button size="sm" className="mt-4" onClick={savePermissions}>
          Save permissions
        </Button>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
        </CardHeader>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Model: <span className="font-medium text-slate-800 dark:text-slate-200">{data.settings.geminiModel}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">Set via the GEMINI_MODEL environment variable.</p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportData}>
            Export data
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      </Card>

      <ConfirmationDialog
        open={confirmDelete}
        title="Delete your account?"
        description="This permanently deletes your plans, memories, activity, and conversations. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        onConfirm={deleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

const inputClass = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded" />
    </label>
  );
}
