import { cacheThrough, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { isValidOrgSlug } from "@/lib/subdomain";
import { withTimeoutOrThrow } from "@/lib/with-timeout";
import logger from "@/lib/logger";

const SUPABASE_LOOKUP_TIMEOUT_MS = 4_000;

export type OrgLookupResult =
  | { status: "found"; org: { id: string; name: string } }
  | { status: "not-found" }
  | { status: "unconfigured" }
  | { status: "error" };

/** Resolve a valid organization wildcard subdomain without exposing DB errors. */
export async function lookupOrgBySlug(rawSlug: string): Promise<OrgLookupResult> {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug || !isValidOrgSlug(slug)) return { status: "not-found" };

  if (!getSupabaseUrl() || !getSupabaseSecretKey()) {
    return { status: "unconfigured" };
  }

  try {
    const org = await cacheThrough(CacheKey.orgBySlug(slug), TTL.PUBLIC_LOOKUP, async () =>
      withTimeoutOrThrow(
        (async () => {
          const { data, error } = await getServiceClient()
            .from("organizations")
            .select("id, name")
            .eq("slug", slug)
            .is("archived_at", null)
            .maybeSingle();
          if (error) throw error;
          return data as { id: string; name: string } | null;
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
