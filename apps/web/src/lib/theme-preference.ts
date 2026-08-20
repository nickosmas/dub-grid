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
 * Body of the blocking `<script>` injected into `<head>` (see
 * `app/layout.tsx`). It has to run *before* next-themes' own inline script —
 * which lives in `<body>` — so that next-themes reads an already-corrected
 * `localStorage` value and paints the right theme on the first frame. Doing
 * this after hydration instead would show a flash of the wrong theme, which
 * is the exact symptom this whole mechanism exists to remove.
 *
 * It only ever writes `localStorage`; the cookie is written after hydration by
 * `ThemeCookieSync`, which keeps the domain-suffix logic in one place rather
 * than duplicating it into a stringified script.
 *
 * The param is stripped with `replaceState` so it can't be bookmarked or
 * shared, and only that one key is removed — `OrgLogin.tsx` reads `verified`
 * and `name` off the same URL.
 */
export function createThemeSeedScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const cookie = JSON.stringify(THEME_COOKIE_NAME);
  const param = JSON.stringify(THEME_PARAM);
  const valid = JSON.stringify(VALID_PREFERENCES);

  return `(function(){try{var K=${key},C=${cookie},P=${param},V=${valid};var q=new URLSearchParams(location.search),p=q.get(P);if(p&&V.indexOf(p)>-1){localStorage.setItem(K,p);q.delete(P);var s=q.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash);return}var m=document.cookie.split("; ").filter(function(c){return c.indexOf(C+"=")===0})[0];if(!m)return;var v=decodeURIComponent(m.slice(C.length+1));if(V.indexOf(v)>-1&&localStorage.getItem(K)!==v){localStorage.setItem(K,v)}}catch(e){}})()`;
}
