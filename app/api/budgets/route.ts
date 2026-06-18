import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { budgetProgress, suggestBudgets } from "@/lib/stats";

export function GET(req: NextRequest) {
  const month =
    req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  return NextResponse.json(budgetProgress(month));
}

/** PUT replaces a single category budget; amount <= 0 deletes it. */
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as { category_id?: number; amount?: number };
  if (typeof body.category_id !== "number" || typeof body.amount !== "number") {
    return NextResponse.json({ error: "category_id and amount required" }, { status: 400 });
  }
  const db = getDb();
  if (body.amount <= 0) {
    db.prepare("DELETE FROM budgets WHERE category_id = ?").run(body.category_id);
  } else {
    db.prepare(
      `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
       ON CONFLICT(category_id) DO UPDATE SET amount = excluded.amount`
    ).run(body.category_id, body.amount);
  }
  return NextResponse.json({ ok: true });
}

/** POST auto-suggests budgets from the last 3 months of spending. */
export function POST() {
  const db = getDb();
  const suggestions = suggestBudgets();
  const upsert = db.prepare(
    `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
     ON CONFLICT(category_id) DO UPDATE SET amount = excluded.amount`
  );
  const tx = db.transaction(() => {
    for (const s of suggestions) upsert.run(s.category_id, s.amount);
  });
  tx();
  return NextResponse.json({ applied: suggestions.length });
}
