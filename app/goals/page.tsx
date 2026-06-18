"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate, fmtEur } from "@/lib/format";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [avgSavings, setAvgSavings] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/finance/api/goals");
    const data = await res.json();
    setGoals(data.goals);
    setAvgSavings(data.avgMonthlySavings);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Savings goals</h1>
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + New goal
        </button>
      </div>

      <div className="card text-sm text-slate-400">
        Average net savings over the last 3 months:{" "}
        <span className={avgSavings >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
          {fmtEur(avgSavings)}/month
        </span>
        {" "}— forecasts below use this pace.
      </div>

      {showAdd && (
        <AddGoalForm
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {goals.length === 0 && !showAdd && (
        <div className="card text-sm text-slate-500">
          No goals yet. Create one — e.g. “Vacation fund”, 1 500 €, next summer.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} avgSavings={avgSavings} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  avgSavings,
  onChanged,
}: {
  goal: Goal;
  avgSavings: number;
  onChanged: () => void;
}) {
  const [saved, setSaved] = useState(String(goal.saved_amount));
  const remaining = Math.max(goal.target_amount - goal.saved_amount, 0);
  const pct = Math.min((goal.saved_amount / goal.target_amount) * 100, 100);

  let forecast: string;
  if (remaining === 0) {
    forecast = "Goal reached 🎉";
  } else if (avgSavings > 0) {
    const months = Math.ceil(remaining / avgSavings);
    const eta = new Date();
    eta.setMonth(eta.getMonth() + months);
    forecast = `~${months} month${months > 1 ? "s" : ""} at your current pace (≈ ${eta.toLocaleDateString("en-GB", { month: "short", year: "numeric" })})`;
  } else {
    forecast = "No positive savings trend yet — reduce expenses to make progress.";
  }

  async function updateSaved() {
    const value = parseFloat(saved.replace(",", "."));
    if (Number.isNaN(value)) return;
    await fetch(`/finance/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved_amount: value }),
    });
    onChanged();
  }

  async function remove() {
    await fetch(`/finance/api/goals/${goal.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="card">
      <div className="mb-2 flex items-start justify-between">
        <div className="text-base font-semibold text-slate-200">
          {goal.icon} {goal.name}
        </div>
        <button className="text-slate-600 hover:text-rose-400" onClick={remove} title="Delete goal">
          ✕
        </button>
      </div>
      <div className="mb-1 flex justify-between text-sm text-slate-400">
        <span>
          {fmtEur(goal.saved_amount)} of {fmtEur(goal.target_amount, true)}
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="mb-3 h-2.5 rounded-full bg-slate-800">
        <div className="h-2.5 rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mb-3 text-xs text-slate-500">
        {forecast}
        {goal.target_date && <div>Target date: {fmtDate(goal.target_date)}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="input w-28"
          value={saved}
          onChange={(e) => setSaved(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateSaved()}
        />
        <button className="btn-secondary" onClick={updateSaved}>
          Update saved
        </button>
      </div>
    </div>
  );
}

function AddGoalForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(target.replace(",", "."));
    if (!amount || Number.isNaN(amount)) {
      setError("Enter a valid target amount");
      return;
    }
    const res = await fetch("/finance/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        icon,
        target_amount: amount,
        target_date: targetDate || null,
      }),
    });
    if (!res.ok) {
      setError("Failed to create goal");
      return;
    }
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Icon
        <select className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>
          {["🎯", "✈️", "🏠", "🚗", "💍", "🎓", "🛟", "💻"].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Name
        <input
          className="input w-48"
          placeholder="Vacation fund"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Target (€)
        <input
          className="input w-28"
          placeholder="1500"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Target date (optional)
        <input
          type="date"
          className="input"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary">
        Create
      </button>
      {error && <span className="text-sm text-rose-400">{error}</span>}
    </form>
  );
}
