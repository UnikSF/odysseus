"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type InviteToken = { token: string; label: string; expires_at: string };

type Status = {
  gocardlessConfigured: boolean;
  aiConfigured: boolean;
};

type SavedKeys = {
  gocardlessSecretId: string;
  gocardlessSecretKey: string;
  anthropicApiKey: string;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [savedKeys, setSavedKeys] = useState<SavedKeys | null>(null);
  const [message, setMessage] = useState("");

  const [gcId, setGcId] = useState("");
  const [gcKey, setGcKey] = useState("");
  const [gcSaving, setGcSaving] = useState(false);

  const [aiKey, setAiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState("");

  const load = useCallback(async () => {
    const [statusRes, keysRes, invitesRes] = await Promise.all([
      fetch("/finance/api/status"),
      fetch("/finance/api/settings"),
      fetch("/finance/api/invite/create"),
    ]);
    setStatus(await statusRes.json());
    setSavedKeys(await keysRes.json());
    if (invitesRes.ok) setInvites(await invitesRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveGocardless() {
    setGcSaving(true);
    setMessage("");
    try {
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gocardlessSecretId: gcId, gocardlessSecretKey: gcKey }),
      });
      setGcId("");
      setGcKey("");
      await load();
      setMessage("GoCardless credentials saved. You can now connect banks in Accounts.");
    } finally {
      setGcSaving(false);
    }
  }

  async function saveAnthropic() {
    setAiSaving(true);
    setMessage("");
    try {
      await fetch("/finance/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: aiKey }),
      });
      setAiKey("");
      await load();
      setMessage("Anthropic API key saved.");
    } finally {
      setAiSaving(false);
    }
  }

  async function createInvite() {
    setInviteCreating(true);
    setNewInviteUrl("");
    try {
      const res = await fetch("/finance/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: inviteLabel.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewInviteUrl(data.url);
        setInviteLabel("");
        await load();
      }
    } finally {
      setInviteCreating(false);
    }
  }

  async function revokeInvite(token: string) {
    await fetch("/finance/api/invite/create", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    await load();
  }

  if (!status || !savedKeys) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {message && (
        <div className="card py-3 text-sm text-slate-300">
          {message}{" "}
          {message.includes("Accounts") && (
            <Link href="/accounts" className="text-emerald-400 underline">
              Go to Accounts →
            </Link>
          )}
        </div>
      )}

      {/* GoCardless */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`badge ${status.gocardlessConfigured ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}
          >
            {status.gocardlessConfigured ? "configured" : "missing"}
          </span>
          <h2 className="text-sm font-semibold text-slate-300">
            Bank sync — GoCardless Bank Account Data
          </h2>
        </div>

        {!status.gocardlessConfigured && (
          <p className="text-xs text-slate-500">
            Create a free account at{" "}
            <span className="text-slate-400">bankaccountdata.gocardless.com</span> → User secrets,
            then paste the values below. Required to connect your banks in{" "}
            <Link href="/accounts" className="text-emerald-400 underline">
              Accounts
            </Link>
            .
          </p>
        )}

        <div className="space-y-1">
          {savedKeys.gocardlessSecretId && (
            <p className="text-xs text-slate-500">
              Secret ID:{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.gocardlessSecretId}</code>
            </p>
          )}
          {savedKeys.gocardlessSecretKey && (
            <p className="text-xs text-slate-500">
              Secret Key:{" "}
              <code className="rounded bg-slate-800 px-1">{savedKeys.gocardlessSecretKey}</code>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Secret ID"
            value={gcId}
            onChange={(e) => setGcId(e.target.value)}
          />
          <input
            className="input"
            placeholder="Secret Key"
            type="password"
            value={gcKey}
            onChange={(e) => setGcKey(e.target.value)}
          />
        </div>
        <button
          className="btn-primary w-full"
          onClick={saveGocardless}
          disabled={gcSaving || (!gcId.trim() && !gcKey.trim())}
        >
          {gcSaving
            ? "Saving…"
            : status.gocardlessConfigured
              ? "Update credentials"
              : "Save credentials"}
        </button>
      </section>

      {/* Anthropic */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={`badge ${status.aiConfigured ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}
          >
            {status.aiConfigured ? "configured" : "missing"}
          </span>
          <h2 className="text-sm font-semibold text-slate-300">
            AI categorization &amp; insights — Anthropic
          </h2>
        </div>

        {!status.aiConfigured && (
          <p className="text-xs text-slate-500">
            Get a key at{" "}
            <span className="text-slate-400">console.anthropic.com/settings/keys</span> and paste
            it below. Optional — rules-based categorization still works without it.
          </p>
        )}

        {savedKeys.anthropicApiKey && (
          <p className="text-xs text-slate-500">
            API Key:{" "}
            <code className="rounded bg-slate-800 px-1">{savedKeys.anthropicApiKey}</code>
          </p>
        )}

        <input
          className="input w-full"
          placeholder="sk-ant-api03-…"
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
        />
        <button
          className="btn-primary w-full"
          onClick={saveAnthropic}
          disabled={aiSaving || !aiKey.trim()}
        >
          {aiSaving ? "Saving…" : status.aiConfigured ? "Update API key" : "Save API key"}
        </button>
      </section>

      {/* Invite links */}
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-300">Invite links</h2>
        <p className="text-xs text-slate-500">
          Share a link with a friend or partner. They connect their own bank and get a live
          financial snapshot — nothing is saved to your database.
        </p>

        {newInviteUrl && (
          <div className="space-y-1 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-3">
            <p className="text-xs text-emerald-300">Invite link created — share this URL:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                {newInviteUrl}
              </code>
              <button
                className="btn-secondary shrink-0 text-xs"
                onClick={() => navigator.clipboard.writeText(newInviteUrl)}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Label (optional, e.g. &quot;Sarah&quot;)"
            value={inviteLabel}
            onChange={(e) => setInviteLabel(e.target.value)}
          />
          <button className="btn-primary shrink-0" onClick={createInvite} disabled={inviteCreating}>
            {inviteCreating ? "Creating…" : "Create invite"}
          </button>
        </div>

        {invites.length > 0 && (
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.token}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-200">{inv.label || "Unnamed invite"}</div>
                  <div className="text-xs text-slate-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString("fr-FR")} ·{" "}
                    <button
                      className="text-slate-400 underline hover:text-slate-200"
                      onClick={() =>
                        navigator.clipboard.writeText(`${window.location.origin}/finance/invite/${inv.token}`)
                      }
                    >
                      Copy link
                    </button>
                  </div>
                </div>
                <button
                  className="text-xs text-rose-500 hover:text-rose-400"
                  onClick={() => revokeInvite(inv.token)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-slate-600">
        All data stays on your machine (data/finance.db). Keys are stored in the local database.
      </p>
    </div>
  );
}
