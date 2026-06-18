import { NextRequest } from "next/server";

/**
 * Public base URL of the app, including the Next.js basePath, e.g.
 * `https://host/finance`.
 *
 * Prefers the `APP_PUBLIC_URL` env var so the value is correct behind a reverse
 * proxy, where the request origin can resolve to an internal address
 * (`http://localhost:3000`) and the basePath is not reflected in the origin.
 * Falls back to the request origin + basePath for local/dev use.
 */
export function publicBaseUrl(req: NextRequest): string {
  const env = process.env.APP_PUBLIC_URL?.replace(/\/+$/, "");
  if (env) return env;
  return `${req.nextUrl.origin}${req.nextUrl.basePath}`;
}

/** Absolute URL to an app path. `path` must start with "/" and exclude basePath. */
export function appUrl(req: NextRequest, path: string): string {
  return `${publicBaseUrl(req)}${path}`;
}
