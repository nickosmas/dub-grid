import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the Origin header against the configured site URL.
 * Returns a 403 response if the origin is invalid, or null if valid.
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

  const allowedHost = new URL(
    siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`,
  ).host;
  const originHost = new URL(origin).host;

  if (originHost !== allowedHost && !originHost.endsWith(`.${allowedHost}`)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  return null;
}
