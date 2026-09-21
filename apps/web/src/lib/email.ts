import { clientEnv } from "@/lib/env";
/** Shared email helpers. Templates live in src/emails/ (react-email). */

/** Strip control characters (including CRLF, null bytes) to prevent email header injection. */
export function sanitizeHeaderValue(str: string): string {
  return str.replace(/[\x00-\x1f\x7f]/g, "");
}

/**
 * Resolve the public origin used for email links and the logo image, with no
 * trailing slash. Falls back to localhost in development; in production a
 * missing origin throws rather than mailing anyone a localhost link.
 */
export function emailBaseUrl(): string {
  const configured =
    clientEnv?.NEXT_PUBLIC_SITE_URL ||
    (clientEnv?.NEXT_PUBLIC_VERCEL_URL ? `https://${clientEnv?.NEXT_PUBLIC_VERCEL_URL}` : null);
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set; refusing to send email with localhost links");
  }
  return "http://localhost:3000";
}
