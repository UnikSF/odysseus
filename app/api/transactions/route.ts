import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { applyRules } from "@/lib/categorize";

export function GET(req: NextRequest) {
  const db = getDb();
  const p = req.nextUrl.searchParams;
  const month = p.get("month");
  const categoryId = p.get("category_id");
  const q = p.get("q");
  const limit = Math.min(parseInt(p.get("limit") ?? "200", 10), 1000);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (month) {
    conditions.push("strftime('%Y-%m', t.date) = ?");
    params.push(month);
  }
  if (categoryId === "none") {
    conditions.push("t.category_id IS NULL");
  } else if (categoryId) {
    conditions.push("t.category_id = ?");
    params.push(parseInt(categoryId, 10));
  }
  if (q) {
    conditions.push("(t.merchant LIKE ? OR t.description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
              a.name AS account_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
       ${where}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT ?`
    )
    .all(...params, limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, amount, merchant, description } = body as {
    date?: string;
    amount?: number;
    merchant?: string;
    description?: string;
  };

  if (!date || typeof amount !== "number" || amount === 0 || !merchant?.trim()) {
    return NextResponse.json(
      { error: "date, non-zero amount and merchant are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = randomUUID();
  const categoryId =
    typeof body.category_id === "number"
      ? body.category_id
      : applyRules(merchant, description ?? "");

  db.prepare(
    `INSERT INTO transactions (id, account_id, date, amount, merchant, description, category_id, categorized_by, source)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, 'manual')`
  ).run(
    id,
    date,
    amount,
    merchant.trim(),
    (description ?? "").trim(),
    categoryId,
    categoryId ? (typeof body.category_id === "number" ? "user" : "rule") : null
  );

  return NextResponse.json({ id }, { status: 201 });
}
