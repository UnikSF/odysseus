import { getDb } from "./db";

export type CategorySpend = {
  category_id: number | null;
  name: string;
  icon: string;
  color: string;
  total: number;
};

export type MonthlyFlow = { month: string; income: number; expenses: number };

export type BudgetProgress = {
  category_id: number;
  name: string;
  icon: string;
  color: string;
  budget: number;
  spent: number;
};

export type TopMerchant = { merchant: string; total: number; count: number };

/** Spending by category for a given month (YYYY-MM). Excludes transfers and savings. */
export function spendingByCategory(month: string): CategorySpend[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.category_id,
              COALESCE(c.name, 'Uncategorized') AS name,
              COALESCE(c.icon, '❓') AS icon,
              COALESCE(c.color, '#475569') AS color,
              SUM(-t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.amount < 0 AND strftime('%Y-%m', t.date) = ?
         AND (c.kind IS NULL OR c.kind = 'expense')
       GROUP BY t.category_id
       ORDER BY total DESC`
    )
    .all(month) as CategorySpend[];
}

/** Income vs expenses for the last n months, oldest first. */
export function monthlyFlows(months = 6): MonthlyFlow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT strftime('%Y-%m', t.date) AS month,
              SUM(CASE WHEN t.amount > 0 AND (c.kind IS NULL OR c.kind != 'transfer') THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN t.amount < 0 AND (c.kind IS NULL OR c.kind != 'transfer') THEN -t.amount ELSE 0 END) AS expenses
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.date >= date('now', 'start of month', ?)
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(`-${months - 1} months`) as MonthlyFlow[];
}

export function budgetProgress(month: string): BudgetProgress[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.category_id, c.name, c.icon, c.color, b.amount AS budget,
              COALESCE((SELECT SUM(-t.amount) FROM transactions t
                        WHERE t.category_id = b.category_id AND t.amount < 0
                          AND strftime('%Y-%m', t.date) = ?), 0) AS spent
       FROM budgets b JOIN categories c ON c.id = b.category_id
       ORDER BY spent / b.amount DESC`
    )
    .all(month) as BudgetProgress[];
}

export function topMerchants(month: string, limit = 8): TopMerchant[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.merchant, SUM(-t.amount) AS total, COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.amount < 0 AND t.merchant != '' AND strftime('%Y-%m', t.date) = ?
         AND (c.kind IS NULL OR c.kind = 'expense')
       GROUP BY UPPER(t.merchant)
       ORDER BY total DESC
       LIMIT ?`
    )
    .all(month, limit) as TopMerchant[];
}

export function monthKpis(month: string): {
  income: number;
  expenses: number;
  net: number;
  uncategorized: number;
  txCount: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.amount > 0 AND (c.kind IS NULL OR c.kind != 'transfer') THEN t.amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.amount < 0 AND (c.kind IS NULL OR c.kind != 'transfer') THEN -t.amount END), 0) AS expenses,
         COALESCE(SUM(CASE WHEN t.category_id IS NULL THEN 1 ELSE 0 END), 0) AS uncategorized,
         COUNT(*) AS txCount
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE strftime('%Y-%m', t.date) = ?`
    )
    .get(month) as { income: number; expenses: number; uncategorized: number; txCount: number };
  return { ...row, net: row.income - row.expenses };
}

/** Suggest a monthly budget per expense category from the last 3 full months (rounded up to nearest 10). */
export function suggestBudgets(): Array<{ category_id: number; amount: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.category_id, strftime('%Y-%m', t.date) AS month, SUM(-t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.amount < 0 AND c.kind = 'expense'
         AND t.date >= date('now', 'start of month', '-3 months')
         AND t.date < date('now', 'start of month')
       GROUP BY t.category_id, month`
    )
    .all() as Array<{ category_id: number; month: string; total: number }>;

  const byCat = new Map<number, number[]>();
  for (const r of rows) {
    const list = byCat.get(r.category_id) ?? [];
    list.push(r.total);
    byCat.set(r.category_id, list);
  }
  const suggestions: Array<{ category_id: number; amount: number }> = [];
  for (const [category_id, totals] of byCat) {
    const avg = totals.reduce((a, b) => a + b, 0) / 3; // average over 3 months even if sparse
    if (avg < 5) continue;
    suggestions.push({ category_id, amount: Math.ceil(avg / 10) * 10 });
  }
  return suggestions;
}

/** Average monthly net savings over the last 3 full months (for goal forecasting). */
export function avgMonthlySavings(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) / 3.0 AS avg_net
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE (c.kind IS NULL OR c.kind != 'transfer')
         AND t.date >= date('now', 'start of month', '-3 months')
         AND t.date < date('now', 'start of month')`
    )
    .get() as { avg_net: number };
  return row.avg_net;
}
