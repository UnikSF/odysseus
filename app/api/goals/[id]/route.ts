import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.saved_amount === "number") {
    fields.push("saved_amount = ?");
    values.push(body.saved_amount);
  }
  if (typeof body.name === "string" && body.name.trim()) {
    fields.push("name = ?");
    values.push(body.name.trim());
  }
  if (typeof body.target_amount === "number" && body.target_amount > 0) {
    fields.push("target_amount = ?");
    values.push(body.target_amount);
  }
  if (body.target_date === null || typeof body.target_date === "string") {
    fields.push("target_date = ?");
    values.push(body.target_date);
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  db.prepare(`UPDATE goals SET ${fields.join(", ")} WHERE id = ?`).run(...values, parseInt(id, 10));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  getDb().prepare("DELETE FROM goals WHERE id = ?").run(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
