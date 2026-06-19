"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtEur } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n";
import type { Insight, InsightProposition } from "@/lib/types";

type ChatMsg = { role: "user" | "assistant"; content: string };

const TYPE_META: Record<InsightProposition["type"], { label: { fr: string; en: string }; classes: string }> = {
  cancel_subscription: { label: { fr: "Abonnement", en: "Subscription" }, classes: "bg-rose-900/50 text-rose-300" },
  reduce_spending: { label: { fr: "Réduire", en: "Reduce" }, classes: "bg-amber-900/50 text-amber-300" },
  unusual_activity: { label: { fr: "Inhabituel", en: "Unusual" }, classes: "bg-purple-900/50 text-purple-300" },
  savings_opportunity: { label: { fr: "Épargne", en: "Savings" }, classes: "bg-emerald-900/50 text-emerald-300" },
  positive_trend: { label: { fr: "Bonne tendance", en: "Good trend" }, classes: "bg-sky-900/50 text-sky-300" },
};

export default function InsightsPage() {
  const t = useT();
  const { locale } = useI18n();
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
        setError(data.error ?? t({ fr: "Échec de la génération", en: "Generation failed" }));
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t({ fr: "Analyses IA", en: "AI Insights" })}</h1>
        <button className="btn-primary" onClick={generate} disabled={busy || !aiConfigured}>
          ✨ {busy ? t({ fr: "Analyse de vos finances…", en: "Analyzing your finances…" }) : t({ fr: "Générer une nouvelle analyse", en: "Generate new analysis" })}
        </button>
      </div>

      <FinanceChat aiConfigured={aiConfigured} />

      {!aiConfigured && (
        <div className="card border-amber-800/50 bg-amber-950/20 text-sm text-amber-200">
          {t({ fr: "Ajoutez", en: "Add" })}{" "}
          <code className="rounded bg-slate-800 px-1">ANTHROPIC_API_KEY</code>{" "}
          {t({ fr: "à", en: "to" })}{" "}
          <code className="rounded bg-slate-800 px-1">.env.local</code>{" "}
          {t({
            fr: "et redémarrez l'application pour activer l'analyse IA. Obtenez une clé sur console.anthropic.com.",
            en: "and restart the app to enable AI analysis. Get a key at console.anthropic.com.",
          })}
        </div>
      )}

      {error && (
        <div className="card border-rose-800/50 bg-rose-950/20 text-sm text-rose-200">{error}</div>
      )}

      {busy && (
        <div className="card animate-pulse text-sm text-slate-400">
          {t({
            fr: "Claude analyse vos habitudes de dépenses, vos prélèvements récurrents et vos budgets…",
            en: "Claude is reading your spending patterns, recurring charges and budgets…",
          })}
        </div>
      )}

      {insights.length === 0 && !busy && aiConfigured && (
        <div className="card text-sm text-slate-500">
          {t({
            fr: "Aucune analyse pour l'instant. Cliquez sur « Générer une nouvelle analyse » — Claude examinera vos dépenses et rédigera des propositions concrètes : abonnements à résilier, dépenses inhabituelles, opportunités d'épargne.",
            en: "No analyses yet. Click “Generate new analysis” — Claude will review your spending and write concrete propositions: subscriptions to cancel, unusual spending, savings opportunities.",
          })}
        </div>
      )}

      {insights.length > 0 && (
        <h2 className="pt-2 text-sm font-semibold text-slate-400">
          {t({ fr: "Analyses sauvegardées", en: "Saved analyses" })}
        </h2>
      )}

      {insights.map((insight) => (
        <section key={insight.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">{t({ fr: "Analyse", en: "Analysis" })}</h2>
            <span className="text-xs text-slate-500">
              {new Date(insight.created_at + "Z").toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}
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
                      <span className={`badge ${meta.classes}`}>{t(meta.label)}</span>
                      {p.monthly_impact_eur !== 0 && (
                        <span
                          className={`text-sm font-semibold ${
                            p.monthly_impact_eur > 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {p.monthly_impact_eur > 0 ? "+" : ""}
                          {fmtEur(p.monthly_impact_eur)}{t({ fr: "/mois", en: "/mo" })}
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

function FinanceChat({ aiConfigured }: { aiConfigured: boolean }) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions: { fr: string; en: string }[] = [
    { fr: "Où puis-je économiser le plus ?", en: "Where can I save the most?" },
    { fr: "Combien puis-je épargner par mois ?", en: "How much can I save per month?" },
    { fr: "Quels abonnements devrais-je résilier ?", en: "Which subscriptions should I cancel?" },
    { fr: "Comment atteindre mon objectif plus vite ?", en: "How can I reach my goal faster?" },
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/finance/api/insights/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t({ fr: "Échec de la réponse", en: "Request failed" }));
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError(t({ fr: "Échec de la réponse", en: "Request failed" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">💬</span>
        <h2 className="text-sm font-semibold text-slate-300">
          {t({ fr: "Discuter de mes finances", en: "Chat about my finances" })}
        </h2>
      </div>
      <p className="text-xs text-slate-500">
        {t({
          fr: "Posez des questions sur vos dépenses et préparez l'avenir — Claude répond à partir de vos données réelles.",
          en: "Ask about your spending and plan ahead — Claude answers from your real data.",
        })}
      </p>

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-3"
        >
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-emerald-600/20 text-emerald-100"
                    : "bg-slate-800/70 text-slate-200"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-800/70 px-3 py-2 text-sm text-slate-400">
                {t({ fr: "Claude réfléchit…", en: "Claude is thinking…" })}
              </div>
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="btn-secondary text-xs"
              onClick={() => send(t(s))}
              disabled={!aiConfigured || busy}
            >
              {t(s)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="input flex-1"
          placeholder={
            aiConfigured
              ? t({ fr: "Posez une question sur vos finances…", en: "Ask a question about your finances…" })
              : t({ fr: "Ajoutez une clé Anthropic dans les Paramètres", en: "Add an Anthropic key in Settings" })
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!aiConfigured || busy}
        />
        <button className="btn-primary shrink-0" type="submit" disabled={!aiConfigured || busy || !input.trim()}>
          {busy ? t({ fr: "…", en: "…" }) : t({ fr: "Envoyer", en: "Send" })}
        </button>
      </form>
    </section>
  );
}
