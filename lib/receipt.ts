// Receipt/ticket parsing with Claude, then match-or-create against transactions.
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb, getSetting } from "./db";
import type { Category, Transaction } from "./types";

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || getSetting("anthropic_api_key") || undefined;
}

export function receiptAiConfigured(): boolean {
  return Boolean(getAnthropicKey());
}

const RECEIPTS_DIR = path.join(process.cwd(), "data", "receipts");

export type ParsedReceipt = {
  merchant: string;
  date: string | null; // YYYY-MM-DD
  total: number | null;
  currency: string;
  category: string | null;
  items: Array<{ name: string; price: number }>;
};

function extFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/** Read a receipt image or PDF with Claude and extract structured fields. */
export async function parseReceipt(buffer: Buffer, mime: string): Promise<ParsedReceipt> {
  const client = new Anthropic({ apiKey: getAnthropicKey() });
  const db = getDb();
  const categories = db.prepare("SELECT * FROM categories").all() as Category[];
  const categoryNames = categories.map((c) => c.name);

  const schema = {
    type: "object",
    properties: {
      merchant: { type: "string", description: "Store / merchant name" },
      date: { type: ["string", "null"], description: "Purchase date as YYYY-MM-DD, or null" },
      total: { type: ["number", "null"], description: "Total amount paid, positive number" },
      currency: { type: "string", description: "ISO currency code, e.g. EUR" },
      category: { type: ["string", "null"], enum: [...categoryNames, null] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, price: { type: "number" } },
          required: ["name", "price"],
          additionalProperties: false,
        },
      },
    },
    required: ["merchant", "date", "total", "currency", "category", "items"],
    additionalProperties: false,
  } as const;

  const data = buffer.toString("base64");
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "Extract the receipt details. Pick the best matching category from the provided list." },
  ];
  if (mime.includes("pdf")) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    });
  } else {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: (mime || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data,
      },
    });
  }

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system:
      `You read a personal purchase receipt for a user in France. Categories: ${categoryNames.join(", ")}. ` +
      "Return the total as a positive number. Use null for fields you can't read.",
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { merchant: "", date: null, total: null, currency: "EUR", category: null, items: [] };
  }
  const parsed = JSON.parse(textBlock.text) as ParsedReceipt;
  parsed.currency = parsed.currency || "EUR";
  parsed.items = parsed.items ?? [];
  return parsed;
}

/**
 * Save the uploaded file and either attach it to a matching bank transaction
 * (by amount + date) or create a new manual expense from it.
 */
export function matchOrCreate(
  parsed: ParsedReceipt,
  file: { buffer: Buffer; mime: string }
): { receiptId: string; transaction: Transaction; created: boolean } {
  const db = getDb();

  // Persist the file to disk.
  if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const receiptId = crypto.randomUUID();
  const filePath = path.join(RECEIPTS_DIR, `${receiptId}.${extFor(file.mime)}`);
  fs.writeFileSync(filePath, file.buffer);

  const categories = db.prepare("SELECT * FROM categories").all() as Category[];
  const catId = parsed.category ? categories.find((c) => c.name === parsed.category)?.id ?? null : null;

  // Try to match an existing un-receipted bank transaction.
  let match: Transaction | undefined;
  if (parsed.total != null && parsed.date) {
    match = db
      .prepare(
        `SELECT * FROM transactions
          WHERE source = 'bank' AND receipt_id IS NULL
            AND ABS(ABS(amount) - ?) < 0.011
            AND date BETWEEN date(?, '-4 days') AND date(?, '+4 days')
          ORDER BY ABS(julianday(date) - julianday(?)) ASC
          LIMIT 1`
      )
      .get(parsed.total, parsed.date, parsed.date, parsed.date) as Transaction | undefined;
  }

  let created = false;
  let txId: string;
  if (match) {
    txId = match.id;
    if (catId) {
      db.prepare("UPDATE transactions SET category_id = ?, categorized_by = 'user' WHERE id = ?").run(catId, txId);
    }
  } else {
    // Create a new manual expense from the receipt.
    created = true;
    txId = crypto.randomUUID();
    const amount = parsed.total != null ? -Math.abs(parsed.total) : 0;
    db.prepare(
      `INSERT INTO transactions
         (id, account_id, date, amount, currency, merchant, description, category_id, categorized_by, source)
       VALUES (?, 'manual', ?, ?, ?, ?, 'Receipt upload', ?, 'user', 'manual')`
    ).run(
      txId,
      parsed.date ?? new Date().toISOString().slice(0, 10),
      amount,
      parsed.currency,
      parsed.merchant || "Receipt",
      catId
    );
  }

  db.prepare(
    `INSERT INTO receipts (id, transaction_id, file_path, mime, merchant, total, currency, parsed_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    receiptId,
    txId,
    filePath,
    file.mime,
    parsed.merchant || "",
    parsed.total,
    parsed.currency,
    JSON.stringify(parsed)
  );
  db.prepare("UPDATE transactions SET receipt_id = ? WHERE id = ?").run(receiptId, txId);

  const transaction = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = ?`
    )
    .get(txId) as Transaction;

  return { receiptId, transaction, created };
}
