import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { aiConfigured } from "@/lib/categorize";
import { gocardlessConfigured } from "@/lib/gocardless";

export function GET() {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts ORDER BY created_at").all();
  const txCount = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  return NextResponse.json({
    gocardlessConfigured: gocardlessConfigured(),
    aiConfigured: aiConfigured(),
    accounts,
    txCount,
  });
}
