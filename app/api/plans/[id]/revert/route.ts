import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { proposeAction, approveAction } from "@/lib/tools/actionService";

const Body = z.object({ version: z.number().int().positive() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid version." }, { status: 400 });

  const { id } = await params;
  const userId = auth.user.uid;
  const repos = getRepositories();
  const plan = await repos.plans.get(userId, id);
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  const user = await repos.users.getUser(userId);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (parsed.data.version === plan.version) {
    return NextResponse.json({ error: "This version is already current." }, { status: 409 });
  }

  const versions = await repos.planVersions.listByPlan(userId, id);
  const target = versions.find((version) => version.version === parsed.data.version);
  if (!target) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const priorKey = `revert:${id}:v${plan.version - 1}->v${target.version}`;
  const latest = versions.find((version) => version.version === plan.version);
  if (latest?.createdBy === "user" && latest.reason === `Restored v${target.version}`) {
    const priorAction = await repos.actions.findByIdempotencyKey(userId, priorKey);
    if (priorAction?.status === "COMPLETED") return NextResponse.json({ action: priorAction });
  }

  const snapshot = target.snapshot;
  const outcome = await proposeAction(userId, {
    proposal: {
      actionType: "MODIFY_PLAN",
      parameters: {
        planId: id,
        title: snapshot.title,
        goal: snapshot.goal,
        description: snapshot.description,
        durationMinutes: snapshot.durationMinutes,
        daysOfWeek: snapshot.schedule.daysOfWeek,
        time: snapshot.schedule.time,
        frequencyLabel: snapshot.frequencyLabel,
        successMetrics: snapshot.successMetrics,
        checkinFrequencyDays: snapshot.checkinFrequencyDays,
        status: snapshot.status,
      },
      reason: `Restored v${target.version}`,
      riskLevel: "medium",
      requiresApproval: false,
    },
    evidenceIds: [],
    permissions: user.settings.permissions,
    autonomyLevel: user.settings.autonomyLevel,
    initiatedBy: "user",
    idempotencyKey: `revert:${id}:v${plan.version}->v${target.version}`,
  });
  if (!outcome.allowed || !outcome.action) return NextResponse.json({ error: outcome.reason }, { status: 403 });
  const action = outcome.action.status === "PENDING_APPROVAL"
    ? await approveAction(userId, outcome.action.id)
    : outcome.action;
  if (action.status === "FAILED") return NextResponse.json({ error: action.error ?? "Restore failed." }, { status: 500 });
  return NextResponse.json({ action });
}
