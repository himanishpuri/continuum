import { NextResponse } from "next/server";
import { isFirebaseAdminConfigured } from "@/lib/auth/firebaseAdmin";

export async function GET() {
  return NextResponse.json({
    demoModeEnabled: process.env.DEMO_MODE === "true",
    firebaseAdminConfigured: isFirebaseAdminConfigured(),
  });
}
