"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/finance/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t({ fr: "Échec de la connexion", en: "Login failed" }));
        return;
      }
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="text-center">
          <div className="mb-2 text-3xl">💸</div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">FinanceWatcher</h1>
          <p className="mt-1 text-sm text-slate-500">{t({ fr: "Connectez-vous pour continuer", en: "Sign in to continue" })}</p>
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
            placeholder={t({ fr: "Mot de passe", en: "Password" })}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? t({ fr: "Connexion…", en: "Signing in…" }) : t({ fr: "Se connecter", en: "Sign in" })}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          {t({ fr: "Pas de compte ?", en: "No account?" })}{" "}
          <Link href="/register" className="text-emerald-400 hover:text-emerald-300">
            {t({ fr: "S'inscrire", en: "Sign up" })}
          </Link>
        </p>
      </div>
    </div>
  );
}
