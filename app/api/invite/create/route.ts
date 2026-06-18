import { NextRequest, NextResponse } from "next/server";
import { createInviteToken, listInviteTokens, revokeInviteToken, getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !getSessionUserId(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(listInviteTokens());
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !getSessionUserId(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { label } = (await req.json()) as { label?: string };
  const inviteToken = createInviteToken(label ?? "");
  const url = `${req.nextUrl.origin}/invite/${inviteToken}`;
  return NextResponse.json({ token: inviteToken, url });
}

export async function DELETE(req: NextRequest) {
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken || !getSessionUserId(sessionToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { token } = (await req.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  revokeInviteToken(token);
  return NextResponse.json({ ok: true });
}
