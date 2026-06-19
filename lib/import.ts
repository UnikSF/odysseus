// Bank-statement import: parse CSV / PDF exports into transactions.
// Shared by the manual upload route and the watched-folder ingest (lib/inbox.ts).
import { randomUUID, createHash } from "crypto";
import { getDb } from "./db";
import { applyRules } from "./categorize";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface RawTx { date: string; description: string; amount: number }

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: number;
  insertedIds: string[];
  warning?: string;
};

// ─── Date / Amount parsers ────────────────────────────────────────────────────

function parseDate(s: string): string | null {
  s = s.trim().split(/[T ]/)[0];
  // DD/MM/YY
  const dmy2 = s.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (dmy2) return `20${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`;
  // DD/MM/YYYY
  const dmy4 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy4) return `${dmy4[3]}-${dmy4[2].padStart(2,"0")}-${dmy4[1].padStart(2,"0")}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function parseAmount(s: string): number | null {
  if (!s?.trim()) return null;
  let v = s.replace(/[€$£ \s ]/g, "").trim();
  // European: dots = thousand sep, comma = decimal  →  "1.234,56"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,(?=\d{3}(?:[^\d]|$))/g, "").replace(",", ".");
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Credit-side keywords → amount stays positive; debit-side → negate
const CREDIT_KEYWORDS = /\b(vir(ement)?\s+(recu|sepa\s+recu)|salaire|remboursement|caf|france\s+travail|pole\s+emploi|cpam|avoir|credit|depot)\b/i;
const DEBIT_KEYWORDS  = /\b(carte|cb|paiement|prlv|prelevement|retrait|frais|cotisation|virement\s+emis|vir\s+emis)\b/i;

function guessSign(description: string, amount: number): number {
  if (amount === 0) return amount;
  const abs = Math.abs(amount);
  if (CREDIT_KEYWORDS.test(description)) return abs;
  if (DEBIT_KEYWORDS.test(description))  return -abs;
  return -abs; // default: expense
}

function extractMerchant(desc: string): string {
  const prefixes = /^(carte\s+\d{2}\/\d{2}\s+|paiement\s+(par\s+)?carte?\s+|cb\s+|prlv\s+(sepa\s+)?|prelevement\s+(sepa\s+)?|virement?\s+(sepa\s+)?(recu\s+)?|retrait\s+dab\s+)/i;
  const m = desc.replace(prefixes, "").trim().replace(/\s+\d{2}\/\d{2}(\s+.*)?$/, "").trim();
  return m.split(/\s+/).slice(0, 5).join(" ") || desc.split(/\s+/).slice(0, 3).join(" ") || "Import";
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function detectDelimiter(line: string): string {
  const c: Record<string,number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of line) if (ch in c) c[ch]++;
  return Object.entries(c).sort((a,b) => b[1]-a[1])[0][0];
}

function parseCsvLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
    else if (ch === delim && !inQ) { fields.push(cur.trim().replace(/^"|"$/g,"")); cur=""; }
    else cur += ch;
  }
  fields.push(cur.trim().replace(/^"|"$/g,""));
  return fields;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/['"]/g,"").trim();

const DATE_H   = ["date","dateoperation","dateop","date operation","date d operation","date de valeur","date comptable","started date","completed date","transaction date"];
const AMOUNT_H = ["montant","amount","valeur","montant en eur","montant eur"];
const DEBIT_H  = ["debit","debit euros","debit eur","montant debit","charges"];
const CREDIT_H = ["credit","credit euros","credit eur","montant credit","deposits"];
const DESC_H   = ["libelle","label","description","intitule","intitule complet","reference","memo","libelle simplifie","libelle operation"];

function findCol(headers: string[], patterns: string[]): number {
  for (const p of patterns) {
    const i = headers.findIndex(h => h===p || h.startsWith(p) || p.startsWith(h));
    if (i !== -1) return i;
  }
  return -1;
}

function parseCsv(text: string): { rows: RawTx[]; error?: string } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], error: "File has no data rows" };

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim).map(norm);

  const dateCol   = findCol(headers, DATE_H);
  const amountCol = findCol(headers, AMOUNT_H);
  const debitCol  = findCol(headers, DEBIT_H);
  const creditCol = findCol(headers, CREDIT_H);
  const descCol   = findCol(headers, DESC_H);

  if (dateCol === -1) return { rows: [], error: `Could not find date column. Headers: ${headers.join(", ")}` };
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) return { rows: [], error: `Could not find amount column. Headers: ${headers.join(", ")}` };

  const rows: RawTx[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i], delim);
    if (row.every(c => !c)) continue;
    const date = parseDate(row[dateCol] ?? "");
    if (!date) continue;

    let amount: number | null = null;
    if (amountCol !== -1) {
      amount = parseAmount(row[amountCol] ?? "");
    } else {
      const debit  = parseAmount(row[debitCol]  ?? "");
      const credit = parseAmount(row[creditCol] ?? "");
      if (debit  != null && debit  !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
    }
    if (amount == null || amount === 0) continue;

    const description = descCol !== -1 ? (row[descCol] ?? "").trim() : "";
    rows.push({ date, description, amount });
  }
  return { rows };
}

// ─── PDF parser ───────────────────────────────────────────────────────────────

// BNP Paribas: PDF strips all spaces, dates appear as "DD.MMdd.mmAMOUNT,CC"
const BNP_TX_RE = /^(\d{2})\.(\d{2})\d{2}\.\d{2}(\d[\d.]*,\d{2})$/;

// General format: line starts with DD/MM/YY or DD/MM/YYYY
const GEN_TX_RE = /^(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4})\s+(.+)$/;
const AMOUNT_AT_END = /(-?\d[\d\s.]*,\d{2})\s*$/;
const TWO_AMOUNTS   = /(-?\d[\d\s.]*,\d{2})\s{2,}(-?\d[\d\s.]*,\d{2})\s*$/;

// Lines to always skip
const SKIP_RE = /^(SOLDE(DEBITEUR|CREDITEUR)|SOLDE\s|TOTALDESOPERATIONS|Date|Naturedesop|Valeur|D.bitCr.dit|DébitCrédit|RELEVEDECOMPTE|RIB:|IBAN:|BIC:|P\.\s*\d+\/\d+|BNP\s*PARIBAS|www\.|Rappel|Montant)/i;

function isBnpFormat(lines: string[]): boolean {
  return lines.some(l => /^RELEVEDECOMPTE/i.test(l) || BNP_TX_RE.test(l));
}

function extractYear(lines: string[]): number {
  for (const l of lines) {
    const m = l.match(/\b(20\d{2})\b/);
    if (m) return parseInt(m[1]);
  }
  return new Date().getFullYear();
}

// BNP credit indicators (no-space concatenated strings)
const BNP_CREDIT_RE = /^(VIRSEPARECU|VIRSEPAINSTANTRECU|VIRCPTEACPTERECU|VIREMENTSEPARECU|CAFDES|ACTIONLOGEMENT)/i;
// BNP debit indicators
const BNP_DEBIT_RE  = /^(FACTURE|PRLVSEPA|PRLV|RETRAIT|CHEQUE|VIREMENTSEPAEMIS|VIRSEPAINSTANTEMIS|VIRCPTEACPTEEMIS|ECHEANCE|COMMISSION|\*COMMISSION)/i;

function bnpSign(description: string, amount: number): number {
  const abs = Math.abs(amount);
  if (BNP_CREDIT_RE.test(description)) return abs;
  if (BNP_DEBIT_RE.test(description))  return -abs;
  return -abs;
}

function parseBnp(lines: string[], year: number): RawTx[] {
  const rows: RawTx[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (SKIP_RE.test(line) || !BNP_TX_RE.test(line)) { i++; continue; }

    const m = line.match(BNP_TX_RE)!;
    const day   = parseInt(m[1]);
    const month = parseInt(m[2]);
    const amount = parseAmount(m[3]);
    if (!amount) { i++; continue; }

    const date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    i++;

    // Collect description lines until next tx line or skip pattern
    const descLines: string[] = [];
    while (i < lines.length && !BNP_TX_RE.test(lines[i]) && !SKIP_RE.test(lines[i])) {
      descLines.push(lines[i]);
      i++;
    }
    const description = descLines.join(" ").trim();
    if (!description) continue;

    rows.push({ date, description, amount: bnpSign(description, amount) });
  }
  return rows;
}

function parseGeneralPdf(lines: string[], year: number): RawTx[] {
  const rows: RawTx[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP_RE.test(line)) continue;

    const txMatch = line.match(GEN_TX_RE);
    if (!txMatch) continue;

    const date = parseDate(txMatch[1]);
    if (!date) continue;

    let rest = txMatch[2].trim();
    if (!AMOUNT_AT_END.test(rest) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (AMOUNT_AT_END.test(next) && !GEN_TX_RE.test(next)) { rest += " " + next; i++; }
    }

    let amount: number | null = null;
    let description = rest;
    const twoM = rest.match(TWO_AMOUNTS);
    if (twoM) {
      const a1 = parseAmount(twoM[1]), a2 = parseAmount(twoM[2]);
      description = rest.slice(0, rest.length - twoM[0].length).trim();
      if (a1 && !a2) amount = -Math.abs(a1);
      else if (a2 && !a1) amount = Math.abs(a2);
      else if (a1) amount = guessSign(description, a1);
    } else {
      const m = rest.match(AMOUNT_AT_END);
      if (m) { amount = parseAmount(m[1]); description = rest.slice(0, rest.length - m[0].length).trim(); if (amount) amount = guessSign(description, amount); }
    }
    if (!amount || /solde|balance/i.test(description)) continue;
    rows.push({ date, description, amount });
  }
  return rows;
}

async function parsePdf(buffer: Buffer): Promise<{ rows: RawTx[]; error?: string }> {
  let pdfParse: (buf: Buffer) => Promise<{ text: string }>;
  try {
    pdfParse = (await import("pdf-parse")).default;
  } catch {
    return { rows: [], error: "PDF parsing library not available" };
  }

  let text: string;
  try {
    const data = await pdfParse(buffer);
    text = data.text;
  } catch {
    return { rows: [], error: "Could not read PDF — make sure it is not password-protected" };
  }

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const year  = extractYear(lines);

  const rows = isBnpFormat(lines)
    ? parseBnp(lines, year)
    : parseGeneralPdf(lines, year);

  if (rows.length === 0) {
    return { rows: [], error: "No transactions found in PDF. The format may not be supported yet." };
  }
  return { rows };
}

// ─── Database insert ──────────────────────────────────────────────────────────

function importRows(rows: RawTx[]): ImportResult {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, account_id, date, amount, merchant, description, category_id, categorized_by, source, hash)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, 'manual', ?)`
  );

  let imported = 0, skipped = 0, errors = 0;
  const insertedIds: string[] = [];
  for (const { date, description, amount } of rows) {
    try {
      const merchant = extractMerchant(description);
      const hash = createHash("sha256")
        .update(`${date}|${amount.toFixed(2)}|${description}`)
        .digest("hex").slice(0, 32);
      const categoryId = applyRules(merchant, description);
      const id = randomUUID();
      const result = insert.run(
        id, date, amount, merchant, description,
        categoryId, categoryId ? "rule" : null, hash
      );
      if (result.changes > 0) { imported++; insertedIds.push(id); } else skipped++;
    } catch { errors++; }
  }
  return { imported, skipped, errors, insertedIds };
}

// ─── Public entry points ──────────────────────────────────────────────────────

/** Parse + import a statement file given its raw bytes and a filename (for type detection). */
export async function importBuffer(buffer: Buffer, filename: string): Promise<ImportResult> {
  const isPdf = filename.toLowerCase().endsWith(".pdf") || buffer.slice(0, 4).toString() === "%PDF";

  let rows: RawTx[];
  let parseError: string | undefined;
  if (isPdf) {
    const result = await parsePdf(buffer);
    rows = result.rows;
    parseError = result.error;
  } else {
    const result = parseCsv(buffer.toString("utf8"));
    rows = result.rows;
    parseError = result.error;
  }

  if (parseError && rows.length === 0) {
    return { imported: 0, skipped: 0, errors: 0, insertedIds: [], warning: parseError };
  }
  return { ...importRows(rows), warning: parseError };
}
