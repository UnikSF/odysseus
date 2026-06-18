import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";
import { appUrl } from "@/lib/publicUrl";

/** GoCardless redirects here after the user authorizes at their bank (?ref=<requisition_id>). */
export async function GET(req: NextRequest) {
  const db = getDb();
  let requisitionId = req.nextUrl.searchParams.get("ref");
  if (!requisitionId) {
    // fall back to the most recent pending requisition
    const latest = db
      .prepare("SELECT id FROM requisitions WHERE status = 'created' ORDER BY created_at DESC")
      .get() as { id: string } | undefined;
    requisitionId = latest?.id ?? null;
  }
  if (!requisitionId) {
    return NextResponse.redirect(appUrl(req, "/settings?bank=error"));
  }

  try {
    const requisition = await getRequisition(requisitionId);
    const stored = db
      .prepare("SELECT institution_name FROM requisitions WHERE id = ?")
      .get(requisitionId) as { institution_name: string } | undefined;
    const institution = stored?.institution_name ?? requisition.institution_id;

    const upsertAccount = db.prepare(
      `INSERT INTO accounts (id, name, institution, type, gocardless_account_id, requisition_id, currency)
       VALUES (?, ?, ?, 'bank', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET requisition_id = excluded.requisition_id`
    );

    for (const accountId of requisition.accounts) {
      let name = institution;
      let currency = "EUR";
      try {
        const details = await getAccountDetails(accountId);
        name = details.account.product ?? details.account.name ?? institution;
        currency = details.account.currency ?? "EUR";
      } catch {
        // details endpoint can be rate-limited; keep defaults
      }
      upsertAccount.run(accountId, name, institution, accountId, requisitionId, currency);
    }

    db.prepare("UPDATE requisitions SET status = ? WHERE id = ?").run(
      requisition.status ?? "linked",
      requisitionId
    );
    return NextResponse.redirect(appUrl(req, "/accounts?bank=connected"));
  } catch {
    return NextResponse.redirect(appUrl(req, "/accounts?bank=error"));
  }
}
