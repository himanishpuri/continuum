import { NextResponse } from "next/server";
import { z } from "genkit";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getRepositories } from "@/lib/repositories";
import { getOrCreateUser } from "@/lib/services/userService";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const user = await getOrCreateUser(auth.user.uid);
  return NextResponse.json(user);
}

const PatchSchema = z.object({
  profile: z.object({ name: z.string().min(1).optional(), timezone: z.string().optional() }).optional(),
  preferences: z
    .object({
      preferredSessionTime: z.string().optional(),
      preferredDurationMinutes: z.number().positive().optional(),
      communicationStyle: z.enum(["concise", "supportive", "direct"]).optional(),
      reminderEnabled: z.boolean().optional(),
    })
    .optional(),
  settings: z
    .object({
      autonomyLevel: z.enum(["conservative", "balanced", "autonomous"]).optional(),
      geminiModel: z.string().optional(),
      permissions: z
        .object({
          canCreateReminders: z.boolean().optional(),
          canModifyPlans: z.boolean().optional(),
          canScheduleFollowups: z.boolean().optional(),
          requireApprovalForExternalActions: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const repos = getRepositories();
  await getOrCreateUser(auth.user.uid);

  if (parsed.data.profile) await repos.users.updateProfile(auth.user.uid, parsed.data.profile);
  if (parsed.data.preferences) await repos.users.updatePreferences(auth.user.uid, parsed.data.preferences);
  if (parsed.data.settings) {
    await repos.users.updateSettings(auth.user.uid, parsed.data.settings);
  }

  const user = await repos.users.getUser(auth.user.uid);
  return NextResponse.json(user);
}
