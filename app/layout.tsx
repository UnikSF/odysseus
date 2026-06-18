import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "FinanceWatcher",
  description: "Personal expense tracking, budgets and AI propositions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6">
            <div className="mb-8 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
              <span className="text-2xl">💸</span> FinanceWatcher
            </div>
            <Nav />
            <div className="mt-auto px-2 text-xs text-slate-600">
              Local data · EUR
            </div>
          </aside>
          <main className="ml-60 flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
