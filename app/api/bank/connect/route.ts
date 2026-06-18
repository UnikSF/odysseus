import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createRequisition, gocardlessConfigured } from "@/lib/gocardless";
import { appUrl } from "@/lib/publicUrl";

export async function POST(req: NextRequest) {
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: "GoCardless not configured" }, { status: 400 });
  }
  const body = (await req.json()) as { institution_id?: string; institution_name?: string };
  if (!body.institution_id) {
    return NextResponse.json({ error: "institution_id required" }, { status: 400 });
  }

  // Must include the basePath ("/finance") and the public host so GoCardless
  // redirects the user back to a route the reverse proxy actually serves.
  const redirect = appUrl(req, "/api/bank/callback");
  try {
    const requisition = await createRequisition(body.institution_id, redirect);
    getDb()
      .prepare(
        "INSERT INTO requisitions (id, institution_id, institution_name, status) VALUES (?, ?, ?, 'created')"
      )
      .run(requisition.id, body.institution_id, body.institution_name ?? body.institution_id);
    // The user opens this link, authenticates at their bank, then is redirected back
    return NextResponse.json({ link: requisition.link, requisition_id: requisition.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to create bank link" },
      { status: 502 }
    );
  }
}
