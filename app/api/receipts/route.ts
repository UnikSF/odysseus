import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseReceipt, matchOrCreate, receiptAiConfigured } from "@/lib/receipt";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export function GET() {
  const db = getDb();
  const receipts = db
    .prepare(
      `SELECT r.id, r.merchant, r.total, r.currency, r.created_at, r.transaction_id,
              t.date AS tx_date, t.amount AS tx_amount, c.name AS category_name, c.icon AS category_icon
         FROM receipts r
         LEFT JOIN transactions t ON t.id = r.transaction_id
         LEFT JOIN categories c ON c.id = t.category_id
        ORDER BY r.created_at DESC
        LIMIT 50`
    )
    .all();
  return NextResponse.json(receipts);
}

export async function POST(req: NextRequest) {
  if (!receiptAiConfigured()) {
    return NextResponse.json(
      { error: "AI not configured — add an Anthropic API key in Settings to read receipts." },
      { status: 400 }
    );
  }

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file") as File | null;
    if (!f) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (f.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }
    file = f;
  } catch {
    return NextResponse.json({ error: "Could not read upload" }, { status: 400 });
  }

  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json({ error: "Unsupported file type. Use an image or PDF." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const parsed = await parseReceipt(buffer, mime);
    const { transaction, created } = matchOrCreate(parsed, { buffer, mime });
    return NextResponse.json({ parsed, transaction, created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read receipt" },
      { status: 502 }
    );
  }
}
