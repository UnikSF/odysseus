"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  localizeCategory,
  type Locale,
  type Msg,
} from "./i18n-shared";

type I18nValue = {
  locale: Locale;
  /** Render a bilingual string in the active locale. */
  t: (m: Msg) => string;
  /** Localize a canonical (English) category name for display. */
  tCat: (name: string | null | undefined) => string;
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: (m) => m[DEFAULT_LOCALE],
  tCat: (name) => localizeCategory(name, DEFAULT_LOCALE),
  setLocale: () => {},
});

export function I18nProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    // Persist for the server (SSR chrome, AI insights, Telegram) and the browser.
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem(LOCALE_COOKIE, l);
    } catch {
      /* ignore */
    }
    void fetch("/finance/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: l }),
    }).catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (m) => m[locale],
      tCat: (name) => localizeCategory(name, locale),
      setLocale,
    }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Shorthand for the translate function. */
export function useT(): (m: Msg) => string {
  return useContext(I18nContext).t;
}
