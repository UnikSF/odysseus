"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/finance/api/auth/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.setupComplete) router.replace("/login");
        else setChecking(false);
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/finance/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed");
        return;
      }
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="text-center">
          <div className="mb-2 text-3xl">💸</div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            First-time setup — your data stays on this machine.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input w-full"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input w-full"
            type="password"
            placeholder="Password (min. 8 characters)"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={saving}>
            {saving ? "Creating account…" : "Create account & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
