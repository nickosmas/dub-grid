import { NextRequest, NextResponse } from "next/server";
import { isValidOrgSlug } from "@/lib/subdomain";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { cacheThrough, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { getSupabaseSecretKey } from "@/lib/supabase-keys";

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

  if (!slug || !isValidOrgSlug(slug)) {
    return NextResponse.json(
      { valid: false },
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getSupabaseSecretKey();

  const cacheHeaders = { "Cache-Control": "public, max-age=60" };

  if (!url || !serviceKey) {
    // Local dev without service key: fail-open so the login flow isn't blocked.
    // Production MUST have the service key configured.
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ valid: true }, { headers: cacheHeaders });
    }
    return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
  }

  const supabase = getServiceClient();

  let data: { id: string; name: string } | null;
  try {
    // Only the found case is cached — organizations.slug is write-once (set
    // at creation, never renamed), so there's no invalidation to handle.
    // Misses aren't cached (cacheThrough can't distinguish "cached miss"
    // from "not yet cached"), which is fine: apiLimiter already bounds
    // repeated lookups of nonexistent slugs.
    data = await cacheThrough(CacheKey.orgBySlug(slug), TTL.PUBLIC_LOOKUP, async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("slug", slug)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, path: "/api/validate-domain" },
      "Supabase query failed",
    );
    return NextResponse.json({ valid: false }, { status: 503, headers: cacheHeaders });
  }

  return NextResponse.json({ valid: !!data, name: data?.name ?? null }, { headers: cacheHeaders });
}
