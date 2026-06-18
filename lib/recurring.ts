import { getDb } from "./db";
import type { RecurringExpense, Transaction } from "./types";

function normalizeMerchant(merchant: string): string {
  return merchant
    .toUpperCase()
    .replace(/\d{2,}/g, "") // strip long digit runs (dates, store numbers)
    .replace(/\s+/g, " ")
    .trim();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000
  );
}

/**
 * Detect recurring expenses: same normalized merchant, >= 2 occurrences,
 * regular interval (weekly / monthly / quarterly / yearly with tolerance),
 * similar amounts (median +/- 25%).
 */
export function detectRecurring(): RecurringExpense[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.amount < 0 AND t.date >= date('now', '-13 months')
       ORDER BY t.date ASC`
    )
    .all() as Transaction[];

  const groups = new Map<string, Transaction[]>();
  for (const t of rows) {
    const key = normalizeMerchant(t.merchant || t.description);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const KNOWN_INTERVALS = [7, 14, 30, 91, 365];
  const result: RecurringExpense[] = [];

  for (const [merchant, txs] of groups) {
    if (txs.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      gaps.push(daysBetween(txs[i - 1].date, txs[i].date));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const interval = KNOWN_INTERVALS.find((k) => Math.abs(avgGap - k) <= k * 0.2);
    if (!interval) continue;
    // every gap must look regular too
    if (!gaps.every((g) => Math.abs(g - interval) <= interval * 0.35)) continue;

    const amounts = txs.map((t) => Math.abs(t.amount)).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (!amounts.every((a) => Math.abs(a - median) <= median * 0.25)) continue;

    const last = txs[txs.length - 1];
    result.push({
      merchant,
      category_id: last.category_id,
      category_name: last.category_name ?? null,
      category_icon: last.category_icon ?? null,
      category_color: last.category_color ?? null,
      avg_amount: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      occurrences: txs.length,
      interval_days: interval,
      last_date: last.date,
      next_date: addDays(last.date, interval),
    });
  }

  return result.sort((a, b) => (a.next_date < b.next_date ? -1 : 1));
}
