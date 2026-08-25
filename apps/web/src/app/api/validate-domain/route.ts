import { NextRequest, NextResponse } from "next/server";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { lookupOrgBySlug } from "@/lib/org-lookup";
import { API_ERRORS } from "@dubgrid/client-errors";

export async function GET(req: NextRequest) {
  // ── Rate limit by IP ──────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, ip);
  if (misconfigured) {
    return NextResponse.json(
      { valid: false, error: API_ERRORS.SERVICE_UNAVAILABLE },
      { status: 503 },
    );
  }
  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 60;
    return NextResponse.json(
      { valid: false, error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const cacheHeaders = { "Cache-Control": "public, max-age=60" };
  const result = await lookupOrgBySlug(req.nextUrl.searchParams.get("slug") ?? "");

  switch (result.status) {
    case "found":
      return NextResponse.json({ valid: true, name: result.org.name }, { headers: cacheHeaders });
    case "not-found":
      return NextResponse.json({ valid: false, name: null }, { headers: cacheHeaders });
    case "unconfigured":
      // Local dev without a service key: fail-open so the login flow isn't
      // blocked. Production MUST have the service key configured.
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({ valid: true, name: null }, { headers: cacheHeaders });
      }
      return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
    case "error":
      return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
  }
}
