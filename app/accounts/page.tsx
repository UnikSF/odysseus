"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Account } from "@/lib/types";
import type { Institution } from "@/lib/gocardless";

const FEATURED_NAMES = ["bnp", "revolut", "caisse d'épargne", "caisse d epargne", "caisse epargne"];

function isFeatured(name: string) {
  const lower = name.toLowerCase();
  return FEATURED_NAMES.some((f) => lower.includes(f));
}

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsContent />
    </Suspense>
  );
}

function AccountsContent() {
  const searchParams = useSearchParams();
  const bankResult = searchParams.get("bank");

  const [gcConfigured, setGcConfigured] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    const res = await fetch("/finance/api/status");
    const data = await res.json();
    setGcConfigured(data.gocardlessConfigured);
    setAccounts(data.accounts);
    setTxCount(data.txCount);
  }, []);

  const loadInstitutions = useCallback(async () => {
    setLoadingInstitutions(true);
    try {
      const res = await fetch("/finance/api/bank/institutions?country=fr");
      const data = await res.json();
      if (res.ok) setInstitutions(data);
      else setMessage(data.error ?? "Failed to load banks");
    } finally {
      setLoadingInstitutions(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (gcConfigured) loadInstitutions();
  }, [gcConfigured, loadInstitutions]);

  useEffect(() => {
    if (bankResult === "connected") loadStatus();
  }, [bankResult, loadStatus]);

  async function connect(inst: Institution) {
    setConnecting(inst.id);
    setMessage("");
    try {
      const res = await fetch("/finance/api/bank/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: inst.id, institution_name: inst.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to start bank connection");
        return;
      }
      window.location.href = data.link;
    } finally {
      setConnecting(null);
    }
  }

  async function sync() {
    setSyncing(true);
    setMessage("");
    try {
      const res = await fetch("/finance/api/bank/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Sync failed");
      } else {
        setMessage(
          `Synced ${data.accounts} account(s): ${data.inserted} new transactions — ` +
            `${data.categorized.byRule} categorized by rules, ${data.categorized.byAi} by AI, ` +
            `${data.categorized.pending} pending.`
        );
      }
    } finally {
      setSyncing(false);
      loadStatus();
    }
  }

  const featured = institutions.filter((i) => isFeatured(i.name));
  const connectedIds = new Set(accounts.map((a) => a.institution));
  const search = bankSearch.trim().toLowerCase();
  const filtered = institutions.filter(
    (i) => !isFeatured(i.name) && (search === "" || i.name.toLowerCase().includes(search))
  );
  const featuredFiltered = featured.filter(
    (i) => search === "" || i.name.toLowerCase().includes(search)
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        {accounts.some((a) => a.type === "bank") && (
          <button className="btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync transactions"}
          </button>
        )}
      </div>

      {bankResult === "connected" && (
        <div className="card border-emerald-800/50 bg-emerald-950/30 text-sm text-emerald-200">
          Bank connected! Click &quot;Sync transactions&quot; to import your history.
        </div>
      )}
      {bankResult === "error" && (
        <div className="card border-rose-800/50 bg-rose-950/20 text-sm text-rose-200">
          Connection failed or was cancelled. Try again.
        </div>
      )}
      {message && <div className="card py-3 text-sm text-slate-300">{message}</div>}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">
            Connected accounts · {txCount} transactions
          </h2>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-200">
                    {a.type === "bank" ? "🏦" : "✋"} {a.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.institution ?? "Manual"} · {a.currency}
                  </div>
                </div>
                <span className="badge bg-slate-800 text-slate-400">{a.type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add bank account */}
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Add a bank account</h2>

        {!gcConfigured && (
          <p className="text-sm text-slate-500">
            Set up your GoCardless API credentials in{" "}
            <a href="/settings" className="text-emerald-400 underline">
              Settings
            </a>{" "}
            first.
          </p>
        )}

        {gcConfigured && loadingInstitutions && (
          <p className="text-sm text-slate-500">Loading banks…</p>
        )}

        {gcConfigured && !loadingInstitutions && institutions.length > 0 && (
          <>
            {/* Featured banks */}
            {featuredFiltered.length > 0 && search === "" && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Popular banks</p>
                <div className="grid grid-cols-3 gap-2">
                  {featuredFiltered.map((inst) => (
                    <button
                      key={inst.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-left text-sm text-slate-300 transition-colors hover:border-emerald-600 hover:bg-slate-800 disabled:opacity-50"
                      onClick={() => connect(inst)}
                      disabled={connecting !== null}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inst.logo} alt="" className="h-8 w-8 shrink-0 rounded" />
                      <div className="min-w-0">
                        <div className="truncate font-medium leading-tight">{inst.name}</div>
                        {connectedIds.has(inst.name) && (
                          <div className="text-xs text-emerald-400">Connected</div>
                        )}
                        {connecting === inst.id && (
                          <div className="text-xs text-slate-400">Connecting…</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="space-y-2">
              {search === "" && featuredFiltered.length > 0 && (
                <p className="text-xs text-slate-500">Other banks</p>
              )}
              <input
                className="input w-full"
                placeholder="Search banks…"
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
              />
            </div>

            {/* Results */}
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
              {(search !== "" ? [...featuredFiltered, ...filtered] : filtered).map((inst) => (
                <button
                  key={inst.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:border-emerald-700 disabled:opacity-50"
                  onClick={() => connect(inst)}
                  disabled={connecting !== null}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inst.logo} alt="" className="h-7 w-7 shrink-0 rounded" />
                  <span className="truncate">{inst.name}</span>
                  {connecting === inst.id && (
                    <span className="ml-auto shrink-0 text-xs text-slate-400">…</span>
                  )}
                </button>
              ))}
              {search !== "" && featuredFiltered.length === 0 && filtered.length === 0 && (
                <p className="col-span-2 text-sm text-slate-500">No banks match &quot;{search}&quot;.</p>
              )}
            </div>

            <p className="text-xs text-slate-500">
              You will be redirected to your bank to authorize read-only access (PSD2), then sent
              back here automatically.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
