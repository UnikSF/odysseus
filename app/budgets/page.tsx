"use client";

import { useCallback, useEffect, useState } from "react";
import { BudgetBar } from "@/components/BudgetBar";
import { currentMonth, fmtEur } from "@/lib/format";
import type { BudgetProgress } from "@/lib/stats";
import type { Category } from "@/lib/types";

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/finance/api/budgets?month=${currentMonth()}`);
    setBudgets(await res.json());
  }, []);

  useEffect(() => {
    fetch("/finance/api/categories").then((r) => r.json()).then(setCategories);
    load();
  }, [load]);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const withBudget = new Set(budgets.map((b) => b.category_id));
  const totalBudget = budgets.reduce((s, b) => s + b.budget, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  async function save(categoryId: number, value: string) {
    const amount = parseFloat(value.replace(",", "."));
    if (Number.isNaN(amount)) return;
    await fetch("/finance/api/budgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, amount }),
    });
    setEdited((e) => {
      const next = { ...e };
      delete next[categoryId];
      return next;
    });
    load();
  }

  async function autoSuggest() {
    const res = await fetch("/finance/api/budgets", { method: "POST" });
    const data = await res.json();
    setMessage(
      data.applied > 0
        ? `Suggested budgets applied to ${data.applied} categories (based on your last 3 months).`
        : "Not enough spending history yet to suggest budgets (needs ~1 month of transactions)."
    );
    load();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
        <button className="btn-primary" onClick={autoSuggest}>
          ✨ Auto-suggest from history
        </button>
      </div>

      {message && <div className="card py-3 text-sm text-slate-300">{message}</div>}

      {budgets.length > 0 && (
        <div className="card">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold text-slate-300">Total this month</span>
            <span className={totalSpent > totalBudget ? "text-rose-400" : "text-slate-400"}>
              {fmtEur(totalSpent)} / {fmtEur(totalBudget, true)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-800">
            <div
              className={`h-2.5 rounded-full ${
                totalSpent / totalBudget < 0.75
                  ? "bg-emerald-500"
                  : totalSpent <= totalBudget
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${Math.min((totalSpent / Math.max(totalBudget, 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="card space-y-5">
        {budgets.map((b) => (
          <div key={b.category_id} className="flex items-center gap-4">
            <div className="flex-1">
              <BudgetBar budget={b} />
            </div>
            <input
              className="input w-24 text-right"
              value={edited[b.category_id] ?? String(b.budget)}
              onChange={(e) =>
                setEdited((prev) => ({ ...prev, [b.category_id]: e.target.value }))
              }
              onBlur={(e) => save(b.category_id, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <button
              className="text-slate-600 hover:text-rose-400"
              title="Remove budget"
              onClick={() => save(b.category_id, "0")}
            >
              ✕
            </button>
          </div>
        ))}
        {budgets.length === 0 && (
          <p className="text-sm text-slate-500">
            No budgets yet. Use auto-suggest, or add one per category below.
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Add a budget</h2>
        <div className="flex flex-wrap gap-2">
          {expenseCategories
            .filter((c) => !withBudget.has(c.id))
            .map((c) => (
              <button
                key={c.id}
                className="btn-secondary"
                onClick={() => save(c.id, "100")}
                title="Adds with a 100 € default — edit afterwards"
              >
                {c.icon} {c.name}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
