import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/auth";
import { listInstitutions, gocardlessConfigured } from "@/lib/gocardless";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validateInviteToken(token)) {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 403 });
  }
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: "Bank sync not configured" }, { status: 503 });
  }
  try {
    return NextResponse.json(await listInstitutions("fr"));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load banks" },
      { status: 502 }
    );
  }
}
