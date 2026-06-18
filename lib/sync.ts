import { createHash } from "crypto";
import { getDb } from "./db";
import { categorizeUncategorized } from "./categorize";
import { getAccountTransactions, type GCTransaction } from "./gocardless";
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

  for (const account of accounts) {
    const data = await getAccountTransactions(account.gocardless_account_id!);
    for (const t of data.transactions.booked) {
      const date = t.bookingDate ?? t.valueDate;
      if (!date) continue;
      const amount = parseFloat(t.transactionAmount.amount);
      if (Number.isNaN(amount)) continue;
      const hash = txHash(account.id, t);
      const res = insert.run(
        t.transactionId ?? t.internalTransactionId ?? hash,
        account.id,
        date,
        amount,
        t.transactionAmount.currency ?? "EUR",
        merchantOf(t),
        descriptionOf(t),
        hash
      );
      inserted += res.changes;
    }
  }

  const categorized = await categorizeUncategorized();
  return { accounts: accounts.length, inserted, categorized };
}
