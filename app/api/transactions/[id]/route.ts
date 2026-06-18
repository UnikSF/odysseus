import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { setUserCategory } from "@/lib/categorize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (typeof body.category_id !== "number") {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }
  setUserCategory(id, body.category_id, body.learn_rule !== false);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const res = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  if (res.changes === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
