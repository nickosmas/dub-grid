/**
 * Shared browser-cookie helpers.
 *
 * Extracted from `CookieConsent.tsx` so the cross-subdomain domain rule lives
 * in exactly one place — the consent cookie and the theme cookie both have to
 * be readable from the apex (`dubgrid.com`) *and* every org subdomain
 * (`acme.dubgrid.com`), and getting that suffix wrong silently splits a
 * preference in two.
 */

export function isSecure(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h.endsWith(".localhost");
}

/**
 * Build a `; domain=...` suffix so the cookie is readable across all subdomains.
 *
 * Returns an empty string on localhost. This is not a shortcut — browsers
 * accept `domain=localhost` but then refuse to send the cookie to
 * `sub.localhost`, so a domain-scoped cookie genuinely cannot be shared
 * between local dev origins. Callers that need cross-origin continuity in
 * dev have to carry the value another way (see `theme-preference.ts`).
 */
export function getCookieDomain(): string {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  if (isLocalhost()) return "";
  // For production (e.g. app.dubgrid.com, org.dubgrid.com) → domain=.dubgrid.com
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    const root = parts.slice(-2).join(".");
    return `; domain=.${root}`;
  }
  return "";
}

/** Read a cookie value by name, or null when absent/unreadable. */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const entry = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
    if (!entry) return null;
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

/** Write a cross-subdomain cookie with the project's standard flags. */
export function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie =
      `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}` +
      `${getCookieDomain()}; SameSite=Lax${isSecure() ? "; Secure" : ""}`;
  } catch {
    /* cookies blocked — callers treat this as best-effort */
  }
}
