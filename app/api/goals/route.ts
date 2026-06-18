import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { avgMonthlySavings } from "@/lib/stats";
import type { Goal } from "@/lib/types";

export function GET() {
  const db = getDb();
  const goals = db.prepare("SELECT * FROM goals ORDER BY id").all() as Goal[];
  return NextResponse.json({ goals, avgMonthlySavings: avgMonthlySavings() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Goal>;
  if (!body.name?.trim() || typeof body.target_amount !== "number" || body.target_amount <= 0) {
    return NextResponse.json({ error: "name and positive target_amount required" }, { status: 400 });
  }
  const db = getDb();
  const res = db
    .prepare(
      "INSERT INTO goals (name, icon, target_amount, saved_amount, target_date) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      body.name.trim(),
      body.icon ?? "🎯",
      body.target_amount,
      body.saved_amount ?? 0,
      body.target_date ?? null
    );
  return NextResponse.json({ id: Number(res.lastInsertRowid) }, { status: 201 });
}
