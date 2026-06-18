import { NextRequest, NextResponse } from "next/server";
import { validateInviteToken } from "@/lib/auth";
import { getRequisition, getAccountDetails, getAccountTransactions, type GCTransaction } from "@/lib/gocardless";
import { applyRules } from "@/lib/categorize";
import { getDb } from "@/lib/db";
import type { Category } from "@/lib/types";
import { appUrl } from "@/lib/publicUrl";

type GuestTx = {
  date: string;
  amount: number;
  merchant: string;
  description: string;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
};

type GuestResults = {
  institution: string;
  accounts: Array<{ name: string; currency: string }>;
  income: number;
  expenses: number;
  net: number;
  byCategory: Array<{ name: string; icon: string; color: string; total: number }>;
  topMerchants: Array<{ merchant: string; total: number }>;
  recentTx: GuestTx[];
};

function extractMerchant(tx: GCTransaction): string {
  return (
    tx.creditorName ??
    tx.debtorName ??
    tx.remittanceInformationUnstructured ??
    (tx.remittanceInformationUnstructuredArray ?? []).join(" ") ??
    ""
  ).trim();
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const institution = req.nextUrl.searchParams.get("institution") ?? "Bank";

  if (!validateInviteToken(token)) {
    return NextResponse.redirect(appUrl(req, `/invite/${token}?error=expired`));
  }

  const requisitionId =
    req.nextUrl.searchParams.get("ref") ??
    req.nextUrl.searchParams.get("requisition_id") ??
    null;

  if (!requisitionId) {
    return NextResponse.redirect(appUrl(req, `/invite/${token}?error=noref`));
  }

  try {
    const db = getDb();
    const categories = db.prepare("SELECT * FROM categories").all() as Category[];
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const requisition = await getRequisition(requisitionId);
    const accountSummaries: Array<{ name: string; currency: string }> = [];
    const allTx: GuestTx[] = [];
    let income = 0;
    let expenses = 0;

    for (const accountId of requisition.accounts) {
      let name = institution;
      let currency = "EUR";
      try {
        const details = await getAccountDetails(accountId);
        name = details.account.product ?? details.account.name ?? institution;
        currency = details.account.currency ?? "EUR";
      } catch {
        // rate limited — keep defaults
      }
      accountSummaries.push({ name, currency });

      let booked: GCTransaction[] = [];
      try {
        const txData = await getAccountTransactions(accountId);
        booked = txData.transactions.booked;
      } catch {
        continue;
      }

      for (const gc of booked) {
        const amount = parseFloat(gc.transactionAmount.amount);
        const merchant = extractMerchant(gc);
        const description = gc.remittanceInformationUnstructured ?? "";
        const catId = applyRules(merchant, description);
        const cat = catId ? catMap.get(catId) : null;

        allTx.push({
          date: gc.bookingDate ?? gc.valueDate ?? "",
          amount,
          merchant: merchant || description.slice(0, 50),
          description,
          category: cat?.name ?? null,
          category_icon: cat?.icon ?? null,
          category_color: cat?.color ?? null,
        });

        if (amount > 0) income += amount;
        else expenses += Math.abs(amount);
      }
    }

    // aggregate by category
    const catTotals = new Map<string, { name: string; icon: string; color: string; total: number }>();
    for (const tx of allTx) {
      if (tx.amount >= 0) continue;
      const key = tx.category ?? "Other";
      const icon = tx.category_icon ?? "🏷️";
      const color = tx.category_color ?? "#64748b";
      const existing = catTotals.get(key);
      if (existing) existing.total += Math.abs(tx.amount);
      else catTotals.set(key, { name: key, icon, color, total: Math.abs(tx.amount) });
    }
    const byCategory = [...catTotals.values()].sort((a, b) => b.total - a.total);

    // top merchants by expense
    const merchantTotals = new Map<string, number>();
    for (const tx of allTx) {
      if (tx.amount >= 0 || !tx.merchant) continue;
      merchantTotals.set(tx.merchant, (merchantTotals.get(tx.merchant) ?? 0) + Math.abs(tx.amount));
    }
    const topMerchants = [...merchantTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([merchant, total]) => ({ merchant, total }));

    const recentTx = [...allTx]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    const results: GuestResults = {
      institution,
      accounts: accountSummaries,
      income,
      expenses,
      net: income - expenses,
      byCategory,
      topMerchants,
      recentTx,
    };

    // store ephemerally (2 hour expiry)
    const expiresAt = new Date(Date.now() + 2 * 3600_000).toISOString();
    db.prepare(
      "INSERT OR REPLACE INTO guest_results (token, data, expires_at) VALUES (?, ?, ?)"
    ).run(token, JSON.stringify(results), expiresAt);

    return NextResponse.redirect(appUrl(req, `/invite/${token}/results`));
  } catch (e) {
    console.error("Invite callback error:", e);
    return NextResponse.redirect(appUrl(req, `/invite/${token}?error=sync`));
  }
}
