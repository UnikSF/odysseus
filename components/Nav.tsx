"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transactions", icon: "🧾" },
  { href: "/accounts", label: "Accounts", icon: "🏦" },
  { href: "/budgets", label: "Budgets", icon: "🎚️" },
  { href: "/goals", label: "Goals", icon: "🎯" },
  { href: "/insights", label: "AI Insights", icon: "✨" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/finance/api/auth/logout", { method: "POST" });
    router.replace("/login");
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
            {item.label}
          </Link>
        );
      })}

      <button
        onClick={logout}
        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900 hover:text-slate-400"
      >
        <span className="text-base">🚪</span>
        Sign out
      </button>
    </nav>
  );
}
