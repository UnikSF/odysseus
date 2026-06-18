import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validateInviteToken(token)) {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 403 });
  }
  const db = getDb();
  const row = db
    .prepare("SELECT data, expires_at FROM guest_results WHERE token = ?")
    .get(token) as { data: string; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "No results yet" }, { status: 404 });
  }
  return NextResponse.json(JSON.parse(row.data));
}
