import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/auth";
import { createRequisition, gocardlessConfigured } from "@/lib/gocardless";
import { appUrl } from "@/lib/publicUrl";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validateInviteToken(token)) {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 403 });
  }
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: "Bank sync not configured" }, { status: 503 });
  }
  const { institution_id, institution_name } = (await req.json()) as {
    institution_id?: string;
    institution_name?: string;
  };
  if (!institution_id) {
    return NextResponse.json({ error: "institution_id required" }, { status: 400 });
  }

  const redirect = appUrl(req, `/api/invite/callback?token=${encodeURIComponent(token)}&institution=${encodeURIComponent(institution_name ?? institution_id)}`);
  try {
    const requisition = await createRequisition(institution_id, redirect);
    return NextResponse.json({ link: requisition.link });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create link" },
      { status: 502 }
    );
  }
}
