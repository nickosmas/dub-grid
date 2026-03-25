import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // ── Rate limit by IP ──────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, ip);
  if (misconfigured) {
    return NextResponse.json(
      { valid: false, error: "Service temporarily unavailable" },
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

  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase();

  if (!slug || RESERVED_SUBDOMAINS.has(slug) || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return NextResponse.json({ valid: false }, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const cacheHeaders = { "Cache-Control": "public, max-age=60" };

  if (!url || !serviceKey) {
    // Local dev without service key: fail-open so the login flow isn't blocked.
    // Production MUST have the service key configured.
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ valid: true }, { headers: cacheHeaders });
    }
    return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
  }

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[validate-domain] Supabase error:", error.message);
    return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
  }

  return NextResponse.json({ valid: !!data }, { headers: cacheHeaders });
}
