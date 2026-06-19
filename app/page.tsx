"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BudgetBar } from "@/components/BudgetBar";
import { CategoryDonut, FlowChart } from "@/components/charts";
import { currentMonth, fmtDate, fmtEur, monthLabel, shiftMonth } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { BudgetProgress, CategorySpend, MonthlyFlow, TopMerchant } from "@/lib/stats";
import type { RecurringExpense } from "@/lib/types";

type Dashboard = {
  month: string;
  kpis: { income: number; expenses: number; net: number; uncategorized: number; txCount: number };
  byCategory: CategorySpend[];
  flows: MonthlyFlow[];
  budgets: BudgetProgress[];
  topMerchants: TopMerchant[];
  recurring: RecurringExpense[];
  fixedMonthlyBase: number;
};

export default function DashboardPage() {
  const t = useT();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Dashboard | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/finance/api/dashboard?month=${month}`);
    setData(await res.json());
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <div className="text-slate-500">{t({ fr: "Chargement…", en: "Loading…" })}</div>;
  }

  const { kpis } = data;
  const maxMerchant = Math.max(...data.topMerchants.map((m) => m.total), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t({ fr: "Tableau de bord", en: "Dashboard" })}
        </h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setMonth(shiftMonth(month, -1))}>
            ←
          </button>
          <span className="w-40 text-center text-sm font-medium text-slate-300">
            {monthLabel(month)}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
          >
            →
          </button>
        </div>
      </div>

      {kpis.txCount === 0 && (
        <div className="card border-emerald-800/50 bg-emerald-950/30 text-sm text-emerald-200">
          {t({
            fr: "Aucune transaction pour ce mois. Connectez votre banque ou ajoutez des dépenses manuellement dans ",
            en: "No transactions yet for this month. Connect your bank or add expenses manually in ",
          })}
          <Link href="/settings" className="underline">
            {t({ fr: "Paramètres", en: "Settings" })}
          </Link>{" "}
          /{" "}
          <Link href="/transactions" className="underline">
            {t({ fr: "Transactions", en: "Transactions" })}
          </Link>
          .
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Kpi
          label={t({ fr: "Revenus", en: "Income" })}
          value={fmtEur(kpis.income)}
          tone="text-emerald-400"
        />
        <Kpi
          label={t({ fr: "Dépenses", en: "Expenses" })}
          value={fmtEur(kpis.expenses)}
          tone="text-rose-400"
        />
        <Kpi
          label={t({ fr: "Net", en: "Net" })}
          value={fmtEur(kpis.net)}
          tone={kpis.net >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <Kpi
          label={t({ fr: "Base mensuelle fixe", en: "Fixed monthly base" })}
          value={fmtEur(data.fixedMonthlyBase)}
          tone="text-sky-400"
          sub={t({
            fr: "abonnements et dépenses récurrentes détectés",
            en: "detected subscriptions & recurring",
          })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">
            {t({ fr: "Dépenses par catégorie", en: "Spending by category" })}
          </h2>
          <CategoryDonut data={data.byCategory} />
        </section>
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">
            {t({ fr: "Revenus vs dépenses (6 mois)", en: "Income vs expenses (6 months)" })}
          </h2>
          <FlowChart data={data.flows} />
        </section>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">
            {t({ fr: "Budgets", en: "Budgets" })}
          </h2>
          {data.budgets.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t({ fr: "Aucun budget pour l'instant — définissez-les dans ", en: "No budgets yet — set them in " })}
              <Link href="/budgets" className="text-emerald-400 underline">
                {t({ fr: "Budgets", en: "Budgets" })}
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-4">
              {data.budgets.slice(0, 5).map((b) => (
                <BudgetBar key={b.category_id} budget={b} />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">
            {t({ fr: "Principaux commerçants", en: "Top merchants" })}
          </h2>
          {data.topMerchants.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t({ fr: "Aucune dépense ce mois-ci.", en: "No expenses this month." })}
            </p>
          ) : (
            <div className="space-y-3">
              {data.topMerchants.map((m) => (
                <div key={m.merchant}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate text-slate-300">{m.merchant}</span>
                    <span className="ml-2 shrink-0 text-slate-400">{fmtEur(m.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${(m.total / maxMerchant) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">
            {t({ fr: "Dépenses récurrentes à venir", en: "Upcoming recurring" })}
          </h2>
          {data.recurring.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t({
                fr: "Aucune dépense récurrente détectée pour l'instant (quelques mois d'historique nécessaires).",
                en: "No recurring expenses detected yet (needs a few months of history).",
              })}
            </p>
          ) : (
            <div className="space-y-3">
              {data.recurring.map((r) => (
                <div key={r.merchant} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-slate-300">
                      {r.category_icon ?? "🔁"} {r.merchant}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t({ fr: "prochain ~", en: "next ~" })}
                      {fmtDate(r.next_date)}
                      {t({ fr: " · tous les ", en: " · every " })}
                      {r.interval_days}
                      {t({ fr: "j", en: "d" })}
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 font-medium text-slate-200">
                    {fmtEur(r.avg_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {kpis.uncategorized > 0 && (
        <div className="card flex items-center justify-between border-amber-800/50 bg-amber-950/20 text-sm text-amber-200">
          <span>
            {t({
              fr: `${kpis.uncategorized} transaction${kpis.uncategorized > 1 ? "s" : ""} sans catégorie ce mois-ci.`,
              en: `${kpis.uncategorized} transaction${kpis.uncategorized > 1 ? "s" : ""} without a category this month.`,
            })}
          </span>
          <Link href="/transactions?category_id=none" className="btn-secondary">
            {t({ fr: "Examiner", en: "Review" })}
          </Link>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
