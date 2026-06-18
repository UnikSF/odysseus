# 💸 FinanceWatcher

A local, visual personal-finance app: imports your bank transactions, categorizes them
automatically (rules + Claude AI), and turns them into budgets, savings goals, recurring-expense
tracking and concrete AI propositions.

All data stays on your machine in `data/finance.db` (SQLite).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

You can use the app immediately with **manual entries** (Transactions → “+ Add expense”).
The two integrations below are optional and enabled via environment variables.

## Configuration (`.env.local`)

Copy `.env.example` to `.env.local`, fill in what you want, restart the app.

### Live bank connection (GoCardless Bank Account Data — free, 2500+ EU banks)

1. Create a free account at https://bankaccountdata.gocardless.com/
2. Dashboard → **User secrets** → create a secret
3. Set `GOCARDLESS_SECRET_ID` and `GOCARDLESS_SECRET_KEY`
4. In the app: **Settings → Connect a bank** → pick your bank → authorize (PSD2, read-only)
5. **Settings → Sync transactions** to import your history (re-run whenever you want fresh data)

### AI categorization & insights (Anthropic)

1. Get an API key at https://console.anthropic.com/settings/keys
2. Set `ANTHROPIC_API_KEY`

Used for two things:
- Categorizing transactions that no rule matches (Transactions → “Categorize uncategorized”)
- The **AI Insights** page: Claude analyzes your spending and writes concrete propositions
  (subscriptions to cancel, unusual spending, savings opportunities)

## How categorization works

1. **Rules first** — a seeded list of French/common merchants (Carrefour, SNCF, EDF, Netflix…)
   matches by substring. Free, instant, offline.
2. **AI fallback** — unmatched transactions are sent to Claude in batches.
3. **Your corrections become rules** — changing a transaction's category in the UI creates a
   high-priority rule for that merchant, so it's categorized correctly forever after.

## Features

- **Dashboard** — monthly KPIs, category donut, 6-month income/expense chart, top merchants,
  budget gauges, upcoming recurring charges, fixed monthly base.
- **Transactions** — filter/search, inline re-categorization, manual entry.
- **Budgets** — per-category monthly limits with auto-suggestion from your last 3 months.
- **Goals** — savings goals with forecasts based on your real average savings pace.
- **AI Insights** — on-demand financial analysis with quantified propositions.

## Tech

Next.js 15 (App Router) · TypeScript · SQLite (better-sqlite3) · Tailwind CSS v4 · Recharts ·
Anthropic SDK · GoCardless Bank Account Data API.
