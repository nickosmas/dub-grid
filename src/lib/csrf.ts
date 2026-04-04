import { NextRequest, NextResponse } from "next/server";

/**
 * Extract the root domain from a hostname (e.g., "acme.dubgrid.com" → "dubgrid.com").
 * Handles localhost and IP addresses by returning them as-is.
 */
function getRootDomain(hostname: string): string {
  // localhost or IP address — return as-is
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }
  // Handle *.localhost subdomains (e.g., "acme.localhost" → "localhost")
  if (hostname.endsWith(".localhost")) {
    return "localhost";
  }
  const parts = hostname.split(".");
  // e.g., "dubgrid.com" → 2 parts, "acme.dubgrid.com" → 3 parts
  return parts.length > 2 ? parts.slice(-2).join(".") : hostname;
}

/**
 * Validates the Origin header against the configured site URL.
 * Returns a 403 response if the origin is invalid, or null if valid.
 * Allows any subdomain of the same root domain (multi-tenant support).
 * Fails closed in production (blocks if Origin or siteUrl is missing).
 */
export function validateCsrfOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null);

  if (!origin || !siteUrl) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    return null;
  }

  const allowedRoot = getRootDomain(
    new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname,
  );
  const originRoot = getRootDomain(new URL(origin).hostname);

  if (originRoot !== allowedRoot) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  return null;
}
