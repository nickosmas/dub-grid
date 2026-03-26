// src/lib/impersonation.ts
// Cookie utilities for gridmaster impersonation sessions.
// Works in both Edge middleware (raw cookie string) and client (document.cookie).

export const IMPERSONATION_COOKIE_NAME = "dubgrid-impersonation";

export interface ImpersonationData {
  sessionId: string;
  targetUserId: string;
  targetOrgId: string;
  targetOrgSlug: string;
  targetOrgRole: string;
  targetEmail: string;
  targetOrgName: string;
  /** Reason for the impersonation session. */
  justification: string;
  expiresAt: string;
}

/**
 * Parse the impersonation cookie from a raw cookie string.
 * Returns null if cookie is missing, malformed, or expired.
 */
export function getImpersonationFromCookie(
  cookieString: string,
): ImpersonationData | null {
  const prefix = `${IMPERSONATION_COOKIE_NAME}=`;
  // Handle both "; " and ";" separators (browser vs middleware)
  const cookie = cookieString
    .split(/;\s*/)
    .find((c) => c.startsWith(prefix));
  if (!cookie) return null;

  try {
    const data: ImpersonationData = JSON.parse(
      decodeURIComponent(cookie.slice(prefix.length)),
    );
    // Validate required fields — only the ones truly needed for
    // impersonation to function. targetOrgSlug, targetEmail, and
    // targetOrgName are display-only and can be empty.
    if (
      !data.sessionId ||
      !data.targetUserId ||
      !data.targetOrgId ||
      !data.targetOrgRole ||
      !data.expiresAt
    ) {
      return null;
    }
    // Check expiry
    if (new Date(data.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Set the impersonation cookie (client-side only). */
export function setImpersonationCookie(data: ImpersonationData): void {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
  );
  const value = encodeURIComponent(JSON.stringify(data));
  // Use domain-less cookie so it's sent on all subdomains automatically.
  // SameSite=Lax is fine — impersonation is same-site navigation.
  document.cookie = `${IMPERSONATION_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Clear the impersonation cookie (client-side only). */
export function clearImpersonationCookie(): void {
  document.cookie = `${IMPERSONATION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
