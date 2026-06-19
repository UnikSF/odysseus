"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { currentMonth, fmtDate, fmtEur, monthLabel, shiftMonth } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import type { Category, Transaction } from "@/lib/types";

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsContent />
    </Suspense>
  );
}

function TransactionsContent() {
  const t = useT();
  const { tCat } = useI18n();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category_id") ?? "");
  const [q, setQ] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month });
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (q) params.set("q", q);
    const res = await fetch(`/finance/api/transactions?${params}`);
    setTransactions(await res.json());
  }, [month, categoryFilter, q]);

  useEffect(() => {
    fetch("/finance/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setCategory(id: string, categoryId: number) {
    await fetch(`/finance/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/finance/api/transactions/${id}`, { method: "DELETE" });
    load();
  }

  async function categorizeWithAi() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/finance/api/categorize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? t({ fr: "Échec de la catégorisation", en: "Categorization failed" }));
      } else {
        setMessage(
          t({
            fr: `Catégorisé ${data.byRule} par règles, ${data.byAi} par IA`,
            en: `Categorized ${data.byRule} by rules, ${data.byAi} by AI`,
          }) +
            (data.pending > 0
              ? t({
                  fr: `, ${data.pending} encore en attente${data.aiConfigured ? "" : " (ajoutez votre clé Anthropic dans Paramètres pour activer l'IA)"}`,
                  en: `, ${data.pending} still pending${data.aiConfigured ? "" : " (add your Anthropic key in Settings to enable AI)"}`,
                })
              : "")
        );
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t({ fr: "Transactions", en: "Transactions" })}</h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={categorizeWithAi} disabled={busy}>
            ✨ {busy ? t({ fr: "Catégorisation…", en: "Categorizing…" }) : t({ fr: "Catégoriser les non classés", en: "Categorize uncategorized" })}
          </button>
          <button className="btn-secondary" onClick={() => { setShowImport((v) => !v); setShowAdd(false); }}>
            📥 {t({ fr: "Importer CSV / PDF", en: "Import CSV / PDF" })}
          </button>
          <button className="btn-primary" onClick={() => { setShowAdd((v) => !v); setShowImport(false); }}>
            + {t({ fr: "Ajouter une dépense", en: "Add expense" })}
          </button>
        </div>
      </div>

      {message && <div className="card py-3 text-sm text-slate-300">{message}</div>}

      {showImport && (
        <ImportForm onImported={() => { setShowImport(false); load(); }} />
      )}

      {showAdd && (
        <AddForm
          categories={categories}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-secondary" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <span className="w-36 text-center text-sm text-slate-300">{monthLabel(month)}</span>
          <button
            className="btn-secondary"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
          >
            →
          </button>
        </div>
        <select
          className="input"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">{t({ fr: "Toutes les catégories", en: "All categories" })}</option>
          <option value="none">❓ {t({ fr: "Non catégorisé", en: "Uncategorized" })}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {tCat(c.name)}
            </option>
          ))}
        </select>
        <input
          className="input w-64"
          placeholder={t({ fr: "Rechercher un commerçant ou une description…", en: "Search merchant or description…" })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">{t({ fr: "Date", en: "Date" })}</th>
              <th className="px-4 py-3">{t({ fr: "Commerçant", en: "Merchant" })}</th>
              <th className="px-4 py-3">{t({ fr: "Catégorie", en: "Category" })}</th>
              <th className="px-4 py-3 text-right">{t({ fr: "Montant", en: "Amount" })}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {t({ fr: "Aucune transaction trouvée pour ces filtres.", en: "No transactions found for these filters." })}
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-800/60 hover:bg-slate-900/60">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{fmtDate(tx.date)}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-200">{tx.merchant || "—"}</div>
                  {tx.description && tx.description !== tx.merchant && (
                    <div className="max-w-md truncate text-xs text-slate-500">{tx.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="input py-1"
                    value={tx.category_id ?? ""}
                    onChange={(e) => setCategory(tx.id, Number(e.target.value))}
                    style={{ borderColor: tx.category_color ?? undefined }}
                  >
                    <option value="" disabled>
                      ❓ {t({ fr: "Choisir…", en: "Pick…" })}
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {tCat(c.name)}
                      </option>
                    ))}
                  </select>
                  {tx.categorized_by === "ai" && (
                    <span className="badge ml-1 bg-purple-900/50 text-purple-300">AI</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${
                    tx.amount < 0 ? "text-slate-200" : "text-emerald-400"
                  }`}
                >
                  {fmtEur(tx.amount)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    className="text-slate-600 hover:text-rose-400"
                    onClick={() => remove(tx.id)}
                    title={t({ fr: "Supprimer", en: "Delete" })}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportForm({ onImported }: { onImported: () => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/finance/api/transactions/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t({ fr: "Échec de l'import", en: "Import failed" })); return; }
      setResult(data);
      if (data.imported > 0) setTimeout(onImported, 1500);
    } finally {
      setLoading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{t({ fr: "Importer depuis un relevé bancaire", en: "Import from bank statement" })}</p>
        <p className="text-xs text-slate-500">{t({ fr: "CSV ou PDF — BNP, Caisse d'Épargne, Crédit Agricole, SocGen, LCL, BoursoBank, Revolut…", en: "CSV or PDF — BNP, Caisse d'Épargne, Crédit Agricole, SocGen, LCL, BoursoBank, Revolut…" })}</p>
      </div>

      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
          dragging ? "border-emerald-500 bg-emerald-950/20" : "border-slate-700 hover:border-slate-500"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="text-2xl">{loading ? "⏳" : "📄"}</span>
        <p className="text-sm text-slate-400">
          {loading ? t({ fr: "Import…", en: "Importing…" }) : t({ fr: "Déposez votre fichier CSV ou PDF ici ou cliquez pour parcourir", en: "Drop your CSV or PDF file here or click to browse" })}
        </p>
        <p className="text-xs text-slate-600">{t({ fr: "Exportez-le depuis le site de votre banque (historique des transactions → export)", en: "Export it from your bank's website (transactions history → export)" })}</p>
        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,.ofx,.pdf" className="hidden" onChange={onFile} disabled={loading} />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm">
          <span className="text-emerald-400 font-medium">{t({ fr: `${result.imported} importées`, en: `${result.imported} imported` })}</span>
          {result.skipped > 0 && <span className="ml-3 text-slate-500">{t({ fr: `${result.skipped} déjà présentes (ignorées)`, en: `${result.skipped} already existed (skipped)` })}</span>}
          {result.errors > 0 && <span className="ml-3 text-amber-400">{t({ fr: `${result.errors} lignes n'ont pas pu être analysées`, en: `${result.errors} rows could not be parsed` })}</span>}
        </div>
      )}
    </div>
  );
}

function AddForm({ categories, onAdded }: { categories: Category[]; onAdded: () => void }) {
  const t = useT();
  const { tCat } = useI18n();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isExpense, setIsExpense] = useState(true);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const value = Math.abs(parseFloat(amount.replace(",", ".")));
    if (!value || Number.isNaN(value)) {
      setError(t({ fr: "Saisissez un montant valide", en: "Enter a valid amount" }));
      return;
    }
    const res = await fetch("/finance/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        merchant,
        amount: isExpense ? -value : value,
        category_id: categoryId ? Number(categoryId) : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t({ fr: "Échec de l'ajout", en: "Failed to add" }));
      return;
    }
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Date", en: "Date" })}
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Commerçant", en: "Merchant" })}
        <input
          className="input w-48"
          placeholder={t({ fr: "ex. Boulangerie", en: "e.g. Boulangerie" })}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Montant (€)", en: "Amount (€)" })}
        <input
          className="input w-28"
          placeholder="12.50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Type", en: "Type" })}
        <select
          className="input"
          value={isExpense ? "expense" : "income"}
          onChange={(e) => setIsExpense(e.target.value === "expense")}
        >
          <option value="expense">{t({ fr: "Dépense", en: "Expense" })}</option>
          <option value="income">{t({ fr: "Revenu", en: "Income" })}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Catégorie (facultatif)", en: "Category (optional)" })}
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t({ fr: "Auto.", en: "Auto" })}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {tCat(c.name)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-primary">
        {t({ fr: "Enregistrer", en: "Save" })}
      </button>
      {error && <span className="text-sm text-rose-400">{error}</span>}
    </form>
  );
}
