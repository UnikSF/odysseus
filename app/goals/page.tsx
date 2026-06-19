"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate, fmtEur } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const t = useT();
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
        <h1 className="text-2xl font-semibold tracking-tight">{t({ fr: "Objectifs d'épargne", en: "Savings goals" })}</h1>
        <button className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + {t({ fr: "Nouvel objectif", en: "New goal" })}
        </button>
      </div>

      <div className="card text-sm text-slate-400">
        {t({ fr: "Épargne nette moyenne sur les 3 derniers mois :", en: "Average net savings over the last 3 months:" })}{" "}
        <span className={avgSavings >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>
          {fmtEur(avgSavings)}{t({ fr: "/mois", en: "/month" })}
        </span>
        {" "}— {t({ fr: "les prévisions ci-dessous utilisent ce rythme.", en: "forecasts below use this pace." })}
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
          {t({
            fr: "Aucun objectif pour l'instant. Créez-en un — par ex. « Fonds vacances », 1 500 €, l'été prochain.",
            en: "No goals yet. Create one — e.g. “Vacation fund”, 1 500 €, next summer.",
          })}
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
  const t = useT();
  const { locale } = useI18n();
  const [saved, setSaved] = useState(String(goal.saved_amount));
  const remaining = Math.max(goal.target_amount - goal.saved_amount, 0);
  const pct = Math.min((goal.saved_amount / goal.target_amount) * 100, 100);

  let forecast: string;
  if (remaining === 0) {
    forecast = t({ fr: "Objectif atteint 🎉", en: "Goal reached 🎉" });
  } else if (avgSavings > 0) {
    const months = Math.ceil(remaining / avgSavings);
    const eta = new Date();
    eta.setMonth(eta.getMonth() + months);
    const etaLabel = eta.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "short", year: "numeric" });
    forecast = t({
      fr: `~${months} mois à votre rythme actuel (≈ ${etaLabel})`,
      en: `~${months} month${months > 1 ? "s" : ""} at your current pace (≈ ${etaLabel})`,
    });
  } else {
    forecast = t({
      fr: "Pas encore de tendance d'épargne positive — réduisez vos dépenses pour progresser.",
      en: "No positive savings trend yet — reduce expenses to make progress.",
    });
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
        <button className="text-slate-600 hover:text-rose-400" onClick={remove} title={t({ fr: "Supprimer l'objectif", en: "Delete goal" })}>
          ✕
        </button>
      </div>
      <div className="mb-1 flex justify-between text-sm text-slate-400">
        <span>
          {fmtEur(goal.saved_amount)} {t({ fr: "sur", en: "of" })} {fmtEur(goal.target_amount, true)}
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="mb-3 h-2.5 rounded-full bg-slate-800">
        <div className="h-2.5 rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mb-3 text-xs text-slate-500">
        {forecast}
        {goal.target_date && <div>{t({ fr: "Date cible :", en: "Target date:" })} {fmtDate(goal.target_date)}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="input w-28"
          value={saved}
          onChange={(e) => setSaved(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateSaved()}
        />
        <button className="btn-secondary" onClick={updateSaved}>
          {t({ fr: "Mettre à jour l'épargne", en: "Update saved" })}
        </button>
      </div>
    </div>
  );
}

function AddGoalForm({ onAdded }: { onAdded: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(target.replace(",", "."));
    if (!amount || Number.isNaN(amount)) {
      setError(t({ fr: "Saisissez un montant cible valide", en: "Enter a valid target amount" }));
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
      setError(t({ fr: "Échec de la création de l'objectif", en: "Failed to create goal" }));
      return;
    }
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Icône", en: "Icon" })}
        <select className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>
          {["🎯", "✈️", "🏠", "🚗", "💍", "🎓", "🛟", "💻"].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Nom", en: "Name" })}
        <input
          className="input w-48"
          placeholder={t({ fr: "Fonds vacances", en: "Vacation fund" })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Montant cible (€)", en: "Target (€)" })}
        <input
          className="input w-28"
          placeholder="1500"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        {t({ fr: "Date cible (facultatif)", en: "Target date (optional)" })}
        <input
          type="date"
          className="input"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary">
        {t({ fr: "Créer", en: "Create" })}
      </button>
      {error && <span className="text-sm text-rose-400">{error}</span>}
    </form>
  );
}
