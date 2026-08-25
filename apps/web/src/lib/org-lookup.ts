import { cacheThrough, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import { getSupabaseSecretKey } from "@/lib/supabase-keys";
import { isValidOrgSlug } from "@/lib/subdomain";
import { withTimeoutOrThrow } from "@/lib/with-timeout";
import logger from "@/lib/logger";

/** Budget for the org lookup. Public path: it must fail rather than hang. */
const SUPABASE_LOOKUP_TIMEOUT_MS = 4_000;

export type OrgSummary = { id: string; name: string };

/**
 * `unconfigured` and `error` are deliberately distinct from `not-found`: the
 * caller must be able to tell "this subdomain has no organization" from "we
 * couldn't check", because those render as opposite states (a hard
 * "Organization not found" vs. a sign-in form that keeps working).
 */
export type OrgLookupResult =
  | { status: "found"; org: OrgSummary }
  | { status: "not-found" }
  | { status: "unconfigured" }
  | { status: "error" };

/**
 * Resolves a subdomain to its organization. Server-only.
 *
 * Redis-cached for 24h (`TTL.PUBLIC_LOOKUP`) — `organizations.slug` is
 * write-once, and the cached `name` is invalidated explicitly on rename and on
 * archive. Only the found case is cached: `cacheThrough` can't distinguish a
 * cached miss from a cold key, and the caller's rate limiter already bounds
 * repeated lookups of nonexistent slugs.
 */
export async function lookupOrgBySlug(rawSlug: string): Promise<OrgLookupResult> {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug || !isValidOrgSlug(slug)) return { status: "not-found" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !getSupabaseSecretKey()) {
    return { status: "unconfigured" };
  }

  const supabase = getServiceClient();

  try {
    const org = await cacheThrough(CacheKey.orgBySlug(slug), TTL.PUBLIC_LOOKUP, async () =>
      // Bounded like every other call on this path. supabase-js has no timeout
      // of its own, and this is what the public subdomain form waits on — an
      // unbounded query here leaves that form spinning indefinitely.
      withTimeoutOrThrow(
        (async () => {
          const { data, error } = await supabase
            .from("organizations")
            .select("id, name")
            .eq("slug", slug)
            .is("archived_at", null)
            .maybeSingle();
          if (error) throw error;
          return data as OrgSummary | null;
        })(),
        SUPABASE_LOOKUP_TIMEOUT_MS,
        "organization slug lookup",
      ),
    );
    return org ? { status: "found", org } : { status: "not-found" };
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, slug },
      "Organization slug lookup failed",
    );
    return { status: "error" };
  }
}
