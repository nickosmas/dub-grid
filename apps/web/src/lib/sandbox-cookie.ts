// Cookie utilities for the per-user test-sandbox "mode".
//
// Modeled after impersonation.ts — the cookie just stores
// { sandboxOrgId, userId } as URL-encoded JSON. Middleware verifies
// ownership against the DB before honoring it, so a forged cookie
// pointing at another user's sandbox cannot leak data.

export const SANDBOX_COOKIE_NAME = "dubgrid-sandbox";

/**
 * Machine-readable code on a refusal whose cause is a sandbox cookie that no
 * longer names a sandbox this session may use (exited elsewhere, deleted by the
 * cleanup cron, a new sign-in, or its owner lost access). The refusing response
 * also clears the cookie, so the client reloads once and lands back in the real
 * organization instead of every request failing until the cookie expires.
 */
export const SANDBOX_ENDED_CODE = "SANDBOX_ENDED";
/**
 * Enter found a sandbox this person opened in another session (another window,
 * browser or device). Nothing was deleted; the client asks before replacing it
 * by resending with `replaceExisting: true`.
 */
export const SANDBOX_OPEN_ELSEWHERE_CODE = "SANDBOX_OPEN_ELSEWHERE";

/**
 * A short-lived, script-readable cookie set alongside clearing the sandbox
 * cookie when the sandbox ended outside this tab. The app reads it once after
 * the reload to say why the person is back in their organization.
 */
export const SANDBOX_ENDED_NOTICE_COOKIE = "dg-sandbox-ended";

export const SANDBOX_ENDED_MESSAGE =
  "Your test sandbox has ended. Reload to return to your organization.";

export interface SandboxCookieData {
  sandboxOrgId: string;
  userId: string;
  sessionId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Parse the sandbox cookie out of a raw cookie string.
 * Returns null when the cookie is missing, malformed, or fails minimal
 * shape validation. Ownership is *not* checked here — that's done in
 * middleware against the DB.
 */
export function getSandboxFromCookie(cookieString: string): SandboxCookieData | null {
  const prefix = `${SANDBOX_COOKIE_NAME}=`;
  const cookie = cookieString.split(/;\s*/).find((c) => c.startsWith(prefix));
  if (!cookie) return null;

  try {
    const data = JSON.parse(
      decodeURIComponent(cookie.slice(prefix.length)),
    ) as Partial<SandboxCookieData> | null;
    if (
      !data ||
      typeof data.sandboxOrgId !== "string" ||
      typeof data.userId !== "string" ||
      typeof data.sessionId !== "string" ||
      !data.sandboxOrgId ||
      !data.userId ||
      !data.sessionId ||
      !UUID_PATTERN.test(data.sandboxOrgId) ||
      !UUID_PATTERN.test(data.userId) ||
      !UUID_PATTERN.test(data.sessionId)
    ) {
      return null;
    }
    return {
      sandboxOrgId: data.sandboxOrgId,
      userId: data.userId,
      sessionId: data.sessionId,
    };
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
