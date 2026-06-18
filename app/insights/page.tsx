"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtEur } from "@/lib/format";
import type { Insight, InsightProposition } from "@/lib/types";

const TYPE_META: Record<InsightProposition["type"], { label: string; classes: string }> = {
  cancel_subscription: { label: "Subscription", classes: "bg-rose-900/50 text-rose-300" },
  reduce_spending: { label: "Reduce", classes: "bg-amber-900/50 text-amber-300" },
  unusual_activity: { label: "Unusual", classes: "bg-purple-900/50 text-purple-300" },
  savings_opportunity: { label: "Savings", classes: "bg-emerald-900/50 text-emerald-300" },
  positive_trend: { label: "Good trend", classes: "bg-sky-900/50 text-sky-300" },
};

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/finance/api/insights");
    const data = await res.json();
    setInsights(data.insights);
    setAiConfigured(data.aiConfigured);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/finance/api/insights", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">AI Insights</h1>
        <button className="btn-primary" onClick={generate} disabled={busy || !aiConfigured}>
          ✨ {busy ? "Analyzing your finances…" : "Generate new analysis"}
        </button>
      </div>

      {!aiConfigured && (
        <div className="card border-amber-800/50 bg-amber-950/20 text-sm text-amber-200">
          Add <code className="rounded bg-slate-800 px-1">ANTHROPIC_API_KEY</code> to{" "}
          <code className="rounded bg-slate-800 px-1">.env.local</code> and restart the app to
          enable AI analysis. Get a key at console.anthropic.com.
        </div>
      )}

      {error && (
        <div className="card border-rose-800/50 bg-rose-950/20 text-sm text-rose-200">{error}</div>
      )}

      {busy && (
        <div className="card animate-pulse text-sm text-slate-400">
          Claude is reading your spending patterns, recurring charges and budgets…
        </div>
      )}

      {insights.length === 0 && !busy && aiConfigured && (
        <div className="card text-sm text-slate-500">
          No analyses yet. Click “Generate new analysis” — Claude will review your spending and
          write concrete propositions: subscriptions to cancel, unusual spending, savings
          opportunities.
        </div>
      )}

      {insights.map((insight) => (
        <section key={insight.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Analysis</h2>
            <span className="text-xs text-slate-500">
              {new Date(insight.created_at + "Z").toLocaleString("en-GB")}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{insight.summary}</p>
          <div className="space-y-3">
            {insight.propositions.map((p, i) => {
              const meta = TYPE_META[p.type] ?? TYPE_META.savings_opportunity;
              return (
                <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-200">{p.title}</div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`badge ${meta.classes}`}>{meta.label}</span>
                      {p.monthly_impact_eur !== 0 && (
                        <span
                          className={`text-sm font-semibold ${
                            p.monthly_impact_eur > 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {p.monthly_impact_eur > 0 ? "+" : ""}
                          {fmtEur(p.monthly_impact_eur)}/mo
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">{p.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
