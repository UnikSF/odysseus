import { NextResponse } from "next/server";
import { gocardlessConfigured } from "@/lib/gocardless";
import { syncBankAccounts } from "@/lib/sync";

export async function POST() {
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: "GoCardless not configured" }, { status: 400 });
  }
  try {
    const result = await syncBankAccounts();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 502 }
    );
  }
}
