// Locale primitives shared between client and server (no React, no DB) so both
// the UI provider (lib/i18n.tsx) and server code (insights, Telegram) can use them.

export type Locale = "fr" | "en";

export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "fw_locale";

/** A bilingual string. Pass to t() to render the active locale. */
export type Msg = { fr: string; en: string };

export function isLocale(v: unknown): v is Locale {
  return v === "fr" || v === "en";
}

/**
 * Display labels for the canonical (English) category names stored in the DB.
 * Categories are never renamed in the database — they are localized here so the
 * FR/EN toggle keeps both languages available and AI/rule mappings stay stable.
 */
export const CATEGORY_LABELS: Record<string, Msg> = {
  "Groceries": { en: "Groceries", fr: "Courses" },
  "Restaurants & Bars": { en: "Restaurants & Bars", fr: "Restaurants & Bars" },
  "Transport": { en: "Transport", fr: "Transport" },
  "Housing & Rent": { en: "Housing & Rent", fr: "Logement & Loyer" },
  "Utilities": { en: "Utilities", fr: "Énergie & Eau" },
  "Subscriptions & Telecom": { en: "Subscriptions & Telecom", fr: "Abonnements & Télécom" },
  "Shopping": { en: "Shopping", fr: "Achats" },
  "Health": { en: "Health", fr: "Santé" },
  "Entertainment": { en: "Entertainment", fr: "Loisirs" },
  "Travel": { en: "Travel", fr: "Voyages" },
  "Education": { en: "Education", fr: "Éducation" },
  "Fees & Charges": { en: "Fees & Charges", fr: "Frais bancaires" },
  "Savings & Investments": { en: "Savings & Investments", fr: "Épargne & Placements" },
  "Cash Withdrawal": { en: "Cash Withdrawal", fr: "Retraits espèces" },
  "Other": { en: "Other", fr: "Autre" },
  "Income": { en: "Income", fr: "Revenus" },
  "Transfers": { en: "Transfers", fr: "Virements" },
};

/** Localize a canonical category name; falls back to the raw name if unknown. */
export function localizeCategory(name: string | null | undefined, locale: Locale): string {
  if (!name) return "";
  return CATEGORY_LABELS[name]?.[locale] ?? name;
}
