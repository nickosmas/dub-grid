/** Shared email helpers. Templates live in src/emails/ (react-email). */

/** Strip control characters (including CRLF, null bytes) to prevent email header injection. */
export function sanitizeHeaderValue(str: string): string {
  return str.replace(/[\x00-\x1f\x7f]/g, "");
}

/**
 * Resolve the public origin used for email links and the logo image, with no
 * trailing slash. Falls back to localhost in dev with a soft warning handled
 * by callers that care.
 */
export function emailBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null) ||
    "http://localhost:3000"
  );
}
