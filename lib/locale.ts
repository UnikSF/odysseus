// Server-side locale resolution for AI insights and Telegram messages.
import type { NextRequest } from "next/server";
import { getSetting } from "./db";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./i18n-shared";

/** Locale stored from the UI toggle; used by background work that has no request. */
export function storedLocale(): Locale {
  const v = getSetting("locale");
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Resolve the locale for a request: cookie first, then the stored setting. */
export function requestLocale(req: NextRequest): Locale {
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return storedLocale();
}
