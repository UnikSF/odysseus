import { createHash } from "crypto";
import { getDb } from "./db";
import { categorizeUncategorized } from "./categorize";
import { getAccountTransactions, type GCTransaction } from "./gocardless";
import { notifyNewTransactions } from "./telegram";
import type { Account } from "./types";

function txHash(accountId: string, t: GCTransaction): string {
  const key = [
    accountId,
    t.transactionId ?? t.internalTransactionId ?? "",
    t.bookingDate ?? t.valueDate ?? "",
    t.transactionAmount.amount,
    t.creditorName ?? t.debtorName ?? "",
    t.remittanceInformationUnstructured ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

function merchantOf(t: GCTransaction): string {
  const amount = parseFloat(t.transactionAmount.amount);
  return (amount < 0 ? t.creditorName : t.debtorName) ?? t.creditorName ?? t.debtorName ?? "";
}

function descriptionOf(t: GCTransaction): string {
  return (
    t.remittanceInformationUnstructured ??
    t.remittanceInformationUnstructuredArray?.join(" ") ??
    ""
  );
}

/** Pull booked transactions for every connected bank account, insert new ones, then categorize. */
export async function syncBankAccounts(): Promise<{
  accounts: number;
  inserted: number;
  categorized: { byRule: number; byAi: number; pending: number };
  notified: number;
}> {
  const db = getDb();
  const accounts = db
    .prepare("SELECT * FROM accounts WHERE type = 'bank' AND gocardless_account_id IS NOT NULL")
    .all() as Account[];

  let inserted = 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, account_id, date, amount, currency, merchant, description, source, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'bank', ?)`
  );
  const markBaselined = db.prepare("UPDATE accounts SET baseline_synced = 1 WHERE id = ?");

  // Ids of transactions newly imported into already-baselined accounts (i.e. ones
  // worth notifying about). The first-ever import of an account is skipped so a
  // full transaction history doesn't trigger hundreds of notifications.
  const notifyIds: string[] = [];

  for (const account of accounts) {
    const wasBaselined = account.baseline_synced === 1;
    const data = await getAccountTransactions(account.gocardless_account_id!);
    for (const t of data.transactions.booked) {
      const date = t.bookingDate ?? t.valueDate;
      if (!date) continue;
      const amount = parseFloat(t.transactionAmount.amount);
      if (Number.isNaN(amount)) continue;
      const hash = txHash(account.id, t);
      const id = t.transactionId ?? t.internalTransactionId ?? hash;
      const res = insert.run(
        id,
        account.id,
        date,
        amount,
        t.transactionAmount.currency ?? "EUR",
        merchantOf(t),
        descriptionOf(t),
        hash
      );
      if (res.changes === 1) {
        inserted++;
        if (wasBaselined) notifyIds.push(id);
      }
    }
    if (!wasBaselined) markBaselined.run(account.id);
  }

  // AI categorization is best-effort — a missing/invalid key must not block the
  // import or the notifications.
  let categorized = { byRule: 0, byAi: 0, pending: 0 };
  try {
    categorized = await categorizeUncategorized();
  } catch (e) {
    console.error("[sync] AI categorization failed (continuing)", e);
  }

  await notifyNewTransactions(notifyIds);

  return { accounts: accounts.length, inserted, categorized, notified: notifyIds.length };
}
