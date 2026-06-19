import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getDb } from "@/lib/db";
import type { Receipt } from "@/lib/types";

function getReceipt(id: string): Receipt | undefined {
  return getDb().prepare("SELECT * FROM receipts WHERE id = ?").get(id) as Receipt | undefined;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = getReceipt(id);
  if (!receipt || !fs.existsSync(receipt.file_path)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const data = fs.readFileSync(receipt.file_path);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": receipt.mime || "application/octet-stream" },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: "not found" }, { status: 404 });

  db.prepare("UPDATE transactions SET receipt_id = NULL WHERE receipt_id = ?").run(id);
  db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
  try {
    if (fs.existsSync(receipt.file_path)) fs.unlinkSync(receipt.file_path);
  } catch {
    // ignore file cleanup errors
  }
  return NextResponse.json({ ok: true });
}
