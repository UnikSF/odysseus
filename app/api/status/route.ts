import { NextResponse } from "next/server";
import { getDb, getSetting } from "@/lib/db";
import { aiConfigured } from "@/lib/categorize";
import { gocardlessConfigured } from "@/lib/gocardless";
import { telegramConfigured } from "@/lib/telegram";
import { schedulerRunning } from "@/lib/scheduler";
import { inboxDir } from "@/lib/inbox";

export function GET() {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts ORDER BY created_at").all();
  const txCount = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  return NextResponse.json({
    gocardlessConfigured: gocardlessConfigured(),
    aiConfigured: aiConfigured(),
    telegramConfigured: telegramConfigured(),
    schedulerRunning: schedulerRunning(),
    syncIntervalHours: Number(getSetting("sync_interval_hours")) || 6,
    importFolder: inboxDir(),
    accounts,
    txCount,
  });
}
