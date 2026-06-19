"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

export default function SetupPage() {
  const t = useT();
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
        setError(data.error ?? t({ fr: "Échec de la configuration", en: "Setup failed" }));
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
            {t({ fr: "Créez votre compte", en: "Create your account" })}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t({
              fr: "Première configuration — vos données restent sur cette machine.",
              en: "First-time setup — your data stays on this machine.",
            })}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input w-full"
            type="email"
            placeholder={t({ fr: "E-mail", en: "Email" })}
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input w-full"
            type="password"
            placeholder={t({ fr: "Mot de passe (8 caractères min.)", en: "Password (min. 8 characters)" })}
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={saving}>
            {saving
              ? t({ fr: "Création du compte…", en: "Creating account…" })
              : t({ fr: "Créer le compte et continuer", en: "Create account & continue" })}
          </button>
        </form>
      </div>
    </div>
  );
}
