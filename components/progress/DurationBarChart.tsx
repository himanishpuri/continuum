"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressSnapshot } from "@/lib/types";

export function DurationBarChart({ buckets }: { buckets: ProgressSnapshot["completionByDuration"] }) {
  const data = [...buckets]
    .filter((b) => b.sampleSize >= 2)
    .sort((a, b) => a.durationMinutes - b.durationMinutes)
    .map((b) => ({
      name: `${b.durationMinutes} min`,
      completion: Math.round(b.completionRate * 100),
      sampleSize: b.sampleSize,
    }));

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Not enough session history yet to compare durations.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "currentColor" }} className="text-slate-500" axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "currentColor" }} className="text-slate-500" axisLine={false} tickLine={false} unit="%" />
        <Tooltip
          formatter={(value, _name, item) => [`${value}% (${(item.payload as { sampleSize: number }).sampleSize} sessions)`, "Completion"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Bar dataKey="completion" radius={[6, 6, 0, 0]} fill="#0f766e" />
      </BarChart>
    </ResponsiveContainer>
  );
}
