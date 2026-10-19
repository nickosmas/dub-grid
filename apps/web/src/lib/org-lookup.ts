import { cacheThrough, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { isValidOrgSlug } from "@/lib/subdomain";
import { withTimeoutOrThrow } from "@/lib/with-timeout";
import logger from "@/lib/logger";

const SUPABASE_LOOKUP_TIMEOUT_MS = 4_000;

export type OrgLookupResult =
  | { status: "found"; org: { id: string; name: string; suspendedAt: string | null } }
  | { status: "archived"; org: { name: string } }
  | { status: "not-found" }
  | { status: "unconfigured" }
  | { status: "error" };

interface CachedOrgLookup {
  id: string;
  name: string;
  archivedAt?: string | null;
  suspendedAt?: string | null;
}

/** Thrown inside the cache fetcher when the caller refuses a database read. */
const MISS_REFUSED = Symbol("org lookup miss refused");

/**
 * Resolve a valid organization wildcard subdomain without exposing DB errors.
 *
 * `admitMiss` runs only when the cache has no answer, before the database is
 * asked; returning false answers "error" instead. It lets a public caller put
 * its rate limit in front of the database without paying for it on a warm hit.
 */
export async function lookupOrgBySlug(
  rawSlug: string,
  options: { admitMiss?: () => Promise<boolean> } = {},
): Promise<OrgLookupResult> {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug || !isValidOrgSlug(slug)) return { status: "not-found" };

  if (!getSupabaseUrl() || !getSupabaseSecretKey()) {
    return { status: "unconfigured" };
  }

  try {
    // Archived and suspended rows are cached too, so the login page can say
    // why an organization is closed instead of behaving as if it never
    // existed (F-87). The gridmaster lifecycle route drops this key on every
    // state change.
    const org = await cacheThrough(CacheKey.orgBySlug(slug), TTL.PUBLIC_LOOKUP, async () => {
      if (options.admitMiss && !(await options.admitMiss())) throw MISS_REFUSED;
      return withTimeoutOrThrow(
        (async () => {
          const { data, error } = await getServiceClient()
            .from("organizations")
            .select("id, name, archived_at, suspended_at")
            .eq("slug", slug)
            .maybeSingle();
          if (error) throw error;
          if (!data) return null;
          const row = data as {
            id: string;
            name: string;
            archived_at: string | null;
            suspended_at: string | null;
          };
          return {
            id: row.id,
            name: row.name,
            archivedAt: row.archived_at,
            suspendedAt: row.suspended_at,
          } satisfies CachedOrgLookup;
        })(),
        SUPABASE_LOOKUP_TIMEOUT_MS,
        "organization slug lookup",
      );
    });
    if (!org) return { status: "not-found" };
    if (org.archivedAt) return { status: "archived", org: { name: org.name } };
    return {
      status: "found",
      org: { id: org.id, name: org.name, suspendedAt: org.suspendedAt ?? null },
    };
  } catch (err) {
    if (err === MISS_REFUSED) return { status: "error" };
    logger.error(
      { err: err instanceof Error ? err.message : err, slug },
      "Organization slug lookup failed",
    );
    return { status: "error" };
  }
}
