// Cookie utilities for the per-user test-sandbox "mode".
//
// Modeled after impersonation.ts — the cookie just stores
// { sandboxOrgId, userId } as URL-encoded JSON. Middleware verifies
// ownership against the DB before honoring it, so a forged cookie
// pointing at another user's sandbox cannot leak data.

export const SANDBOX_COOKIE_NAME = "dubgrid-sandbox";

export interface SandboxCookieData {
  sandboxOrgId: string;
  userId: string;
}

const secureSuffix =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "; Secure"
    : "";

/**
 * Parse the sandbox cookie out of a raw cookie string.
 * Returns null when the cookie is missing, malformed, or fails minimal
 * shape validation. Ownership is *not* checked here — that's done in
 * middleware against the DB.
 */
export function getSandboxFromCookie(
  cookieString: string,
): SandboxCookieData | null {
  const prefix = `${SANDBOX_COOKIE_NAME}=`;
  const cookie = cookieString
    .split(/;\s*/)
    .find((c) => c.startsWith(prefix));
  if (!cookie) return null;

  try {
    const data = JSON.parse(decodeURIComponent(cookie.slice(prefix.length))) as
      | Partial<SandboxCookieData>
      | null;
    if (
      !data ||
      typeof data.sandboxOrgId !== "string" ||
      typeof data.userId !== "string" ||
      !data.sandboxOrgId ||
      !data.userId
    ) {
      return null;
    }
    return { sandboxOrgId: data.sandboxOrgId, userId: data.userId };
  } catch {
    return null;
  }
}

/**
 * Encode the cookie body — used by server routes that set the cookie
 * via Set-Cookie on a NextResponse.
 */
export function encodeSandboxCookieValue(data: SandboxCookieData): string {
  return encodeURIComponent(JSON.stringify(data));
}

/** Client-side helper: clear the sandbox cookie. */
export function clearSandboxCookieFromBrowser(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SANDBOX_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secureSuffix}`;
}
