"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { Msg } from "@/lib/i18n-shared";

const ITEMS: Array<{ href: string; label: Msg; icon: string }> = [
  { href: "/", label: { fr: "Tableau de bord", en: "Dashboard" }, icon: "📊" },
  { href: "/transactions", label: { fr: "Transactions", en: "Transactions" }, icon: "🧾" },
  { href: "/receipts", label: { fr: "Reçus", en: "Receipts" }, icon: "📸" },
  { href: "/accounts", label: { fr: "Comptes", en: "Accounts" }, icon: "🏦" },
  { href: "/budgets", label: { fr: "Budgets", en: "Budgets" }, icon: "🎚️" },
  { href: "/goals", label: { fr: "Objectifs", en: "Goals" }, icon: "🎯" },
  { href: "/insights", label: { fr: "Analyses IA", en: "AI Insights" }, icon: "✨" },
  { href: "/settings", label: { fr: "Paramètres", en: "Settings" }, icon: "⚙️" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();

  async function logout() {
    await fetch("/finance/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function switchLocale(l: "fr" | "en") {
    setLocale(l);
    router.refresh();
  }

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-emerald-600/15 text-emerald-400"
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {t(item.label)}
          </Link>
        );
      })}

      <button
        onClick={logout}
        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900 hover:text-slate-400"
      >
        <span className="text-base">🚪</span>
        {t({ fr: "Se déconnecter", en: "Sign out" })}
      </button>

      <div className="mt-3 flex gap-1 px-1">
        {(["fr", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => switchLocale(l)}
            className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold uppercase transition-colors ${
              locale === l
                ? "bg-emerald-600/20 text-emerald-300"
                : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
            }`}
          >
            {l === "fr" ? "🇫🇷 FR" : "🇬🇧 EN"}
          </button>
        ))}
      </div>
    </nav>
  );
}
