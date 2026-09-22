/**
 * Carries the user's theme preference across the apex ↔ org-subdomain
 * boundary.
 *
 * `localhost:3000` (landing, subdomain entry) and `acme.localhost:3000`
 * (sign-in, app) are separate browser origins, so the `localStorage` key
 * next-themes reads from does not cross between them. Without a transport,
 * picking "light" on the landing page and then signing in drops you onto a
 * page that resolves the *other* origin's preference — the theme appears to
 * flip mid-flow.
 *
 * Two transports, because neither covers everything on its own:
 *
 *  - **Cookie** (`dg-theme`, domain-scoped): durable and covers every
 *    crossing, including typing the other host directly. Production only —
 *    browsers refuse to share a domain-scoped cookie between `localhost` and
 *    `sub.localhost` (see `getCookieDomain` in `lib/cookies.ts`).
 *  - **Query param** (`?theme=`): attached to the handful of links that
 *    deliberately hop origins. Works identically in dev and production.
 *
 * `localStorage.theme` stays the source of truth that next-themes reads;
 * both transports only ever seed it.
 */

import { readCookie, writeCookie } from "@/lib/cookies";

/** Must match the `storageKey` next-themes uses (its default). */
export const THEME_STORAGE_KEY = "theme";

export const THEME_COOKIE_NAME = "dg-theme";
export const THEME_PARAM = "theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark" | "system";

const VALID_PREFERENCES: readonly string[] = ["light", "dark", "system"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && VALID_PREFERENCES.includes(value);
}

/** Read the shared preference cookie, or null when absent/invalid. */
export function readThemeCookie(): ThemePreference | null {
  const raw = readCookie(THEME_COOKIE_NAME);
  return isThemePreference(raw) ? raw : null;
}

/** Mirror the live preference into the cross-subdomain cookie. Best-effort. */
export function writeThemeCookie(preference: ThemePreference): void {
  writeCookie(THEME_COOKIE_NAME, preference, ONE_YEAR_SECONDS);
}

/**
 * Append the current preference to a cross-origin URL so the destination
 * origin can adopt it before it paints.
 *
 * Returns the URL unchanged when the preference is missing (next-themes
 * reports `undefined` until it has mounted) or unrecognised, so a bad value
 * can never produce a malformed redirect.
 */
export function withThemeParam(url: string, preference: string | undefined): string {
  if (!isThemePreference(preference)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${THEME_PARAM}=${preference}`;
}

/**
 * The preference a request arrived with, in the order the pre-paint seed
 * script applies it: a `?theme=` param wins over the `dg-theme` cookie, and
 * anything unrecognised is ignored.
 *
 * Lets a Server Component build a cross-origin link that already carries the
 * theme. next-themes cannot report one until it has mounted, so a client
 * component that reads `useTheme()` during render produces different hrefs on
 * the server and on its first client pass, and React flags the mismatch.
 */
export function resolveRequestTheme(
  param: string | string[] | undefined,
  cookie: string | undefined,
): ThemePreference | undefined {
  const fromParam = Array.isArray(param) ? param[0] : param;
  if (isThemePreference(fromParam)) return fromParam;
  return isThemePreference(cookie) ? cookie : undefined;
}
