import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM categories ORDER BY kind, name").all();
  return NextResponse.json(rows);
}
