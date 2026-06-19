import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { I18nProvider } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/lib/i18n-shared";

export const metadata: Metadata = {
  title: "FinanceWatcher",
  description: "Suivi des dépenses, budgets et propositions IA",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const footer = locale === "fr" ? "Données locales · EUR" : "Local data · EUR";

  return (
    <html lang={locale}>
      <body>
        <I18nProvider initial={locale}>
          <div className="flex min-h-screen">
            <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6">
              <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
                <span className="text-2xl">💸</span> FinanceWatcher
              </div>
              <Nav />
              <div className="mt-auto px-2 text-xs text-slate-600">{footer}</div>
            </aside>
            <main className="ml-60 flex-1 px-8 py-8">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
