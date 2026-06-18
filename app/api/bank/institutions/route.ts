import { NextRequest, NextResponse } from "next/server";
import { gocardlessConfigured, listInstitutions } from "@/lib/gocardless";

export async function GET(req: NextRequest) {
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: "GoCardless not configured" }, { status: 400 });
  }
  const country = req.nextUrl.searchParams.get("country") ?? "fr";
  try {
    return NextResponse.json(await listInstitutions(country));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to list institutions" },
      { status: 502 }
    );
  }
}
