"use client";

import { use, useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useI18n } from "@/lib/i18n";

type GuestTx = {
  date: string;
  amount: number;
  merchant: string;
  category: string | null;
  category_icon: string | null;
};

type Results = {
  institution: string;
  accounts: Array<{ name: string; currency: string }>;
  income: number;
  expenses: number;
  net: number;
  byCategory: Array<{ name: string; icon: string; color: string; total: number }>;
  topMerchants: Array<{ merchant: string; total: number }>;
  recentTx: GuestTx[];
};

function fmtEur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

export default function GuestResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { t, tCat } = useI18n();
  const { token } = use(params);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/finance/api/invite/${token}/results`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setResults(d);
      })
      .catch(() => setError(t({ fr: "Échec du chargement des résultats", en: "Failed to load results" })));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="max-w-sm text-center">
          <div className="mb-3 text-3xl">💸</div>
          <p className="text-slate-400">{error}</p>
          <a href={`/invite/${token}`} className="mt-4 inline-block text-sm text-emerald-400 underline">
            {t({ fr: "← Réessayer", en: "← Try again" })}
          </a>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-500">{t({ fr: "Chargement de vos analyses…", en: "Loading your insights…" })}</p>
      </div>
    );
  }

  const maxMerchant = Math.max(...results.topMerchants.map((m) => m.total), 1);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mb-1 text-3xl">💸</div>
          <h1 className="text-xl font-semibold text-slate-100">{t({ fr: "Votre aperçu financier", en: "Your financial snapshot" })}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {results.accounts.map((a) => a.name).join(", ")} · {t({ fr: "lecture seule, non enregistré", en: "read-only, not saved" })}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label={t({ fr: "Revenus", en: "Income" })} value={fmtEur(results.income)} tone="text-emerald-400" />
          <Kpi label={t({ fr: "Dépenses", en: "Expenses" })} value={fmtEur(results.expenses)} tone="text-rose-400" />
          <Kpi
            label={t({ fr: "Solde net", en: "Net" })}
            value={fmtEur(results.net)}
            tone={results.net >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
        </div>

        {/* Spending by category */}
        {results.byCategory.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">{t({ fr: "Dépenses par catégorie", en: "Spending by category" })}</h2>
            <div className="flex gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={results.byCategory.slice(0, 8)}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {results.byCategory.slice(0, 8).map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtEur(v)}
                    contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {results.byCategory.slice(0, 8).map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span>{c.icon}</span> {tCat(c.name)}
                    </span>
                    <span className="text-slate-400">{fmtEur(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Top merchants */}
        {results.topMerchants.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">{t({ fr: "Principaux commerçants", en: "Top merchants" })}</h2>
            {results.topMerchants.map((m) => (
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
          </section>
        )}

        {/* Recent transactions */}
        {results.recentTx.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">{t({ fr: "Transactions récentes", en: "Recent transactions" })}</h2>
            <div className="space-y-1">
              {results.recentTx.map((tx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-200">
                      {tx.category_icon ?? "🏷️"} {tx.merchant || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {tx.date} · {tx.category ? tCat(tx.category) : t({ fr: "Non catégorisé", en: "Uncategorized" })}
                    </div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 font-medium ${tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {fmtEur(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-slate-700">
          {t({
            fr: "Cette vue est temporaire et expirera dans 2 heures. Aucune donnée n'a été enregistrée.",
            en: "This view is temporary and will expire in 2 hours. No data was stored.",
          })}
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
