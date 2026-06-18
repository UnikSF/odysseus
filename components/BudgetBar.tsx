"use client";

import { fmtEur } from "@/lib/format";
import type { BudgetProgress } from "@/lib/stats";

export function BudgetBar({ budget }: { budget: BudgetProgress }) {
  const ratio = budget.budget > 0 ? budget.spent / budget.budget : 0;
  const pct = Math.min(ratio * 100, 100);
  const color = ratio < 0.75 ? "bg-emerald-500" : ratio <= 1 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-300">
          {budget.icon} {budget.name}
        </span>
        <span className={ratio > 1 ? "text-rose-400" : "text-slate-400"}>
          {fmtEur(budget.spent)} / {fmtEur(budget.budget, true)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
