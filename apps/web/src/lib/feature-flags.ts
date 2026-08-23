import { unstable_cache } from "next/cache";
import { cacheThrough, cacheDel, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * Data Cache tag for the flag read, so a gridmaster write busts it at once
 * instead of waiting out the TTL.
 *
 * `revalidateTag` is deliberately NOT called from this module. Next bundles
 * this file for the client SSR graph too (it reaches here via lib/sentry), and
 * a static `revalidateTag` import fails the build there. The one writer —
 * app/api/gridmaster/platform-flags/route.ts — calls it directly instead.
 */
export const PLATFORM_FLAGS_TAG = "platform-feature-flags";

type PlatformFlagRow = { key: string; enabled: boolean };

async function loadAllFlags(): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await getServiceClient()
      .from("platform_feature_flags")
      .select("key, enabled");

    if (error) {
      // A DB hiccup must never itself act as a kill switch — this table only
      // exists so an admin can turn something off on purpose. Fail open and log
      // loudly so the read failure is visible without taking anything down.
      // Also alert (not just log) — this table is exactly what a gridmaster
      // reaches for mid-incident, so losing the ability to enforce/read flags
      // needs to page someone, not just leave a line in the logs.
      logger.error({ error }, "platform_feature_flags read failed; treating all flags as enabled");
      Sentry.captureException(error, { extra: { context: "platform-feature-flags-read" } });
      return {};
    }

    return Object.fromEntries((data as PlatformFlagRow[]).map((row) => [row.key, row.enabled]));
  } catch (error) {
    // getServiceClient() throws when Supabase env vars are absent — most notably
    // during `next build`, which statically prerenders pages that render the
    // async root layout (it reads a kill switch). A missing-env build context
    // must not crash the build, so fail open here exactly as the DB-error branch
    // above does: no flags → every key resolves to its default.
    logger.error({ error }, "platform_feature_flags load threw; treating all flags as enabled");
    Sentry.captureException(error, { extra: { context: "platform-feature-flags-load" } });
    return {};
  }
}

/**
 * The Redis read, wrapped in Next's Data Cache.
 *
 * The wrapper is load-bearing for correctness, not just speed. @upstash/redis
 * issues its REST calls with `cache: "no-store"` (it has no option not to), and
 * a no-store fetch during render opts that route out of the Full Route Cache.
 * The root layout reads a flag, so an *unwrapped* read opted every route in the
 * app out of static rendering: Vercel served every page `no-store`, overriding
 * even a page's own `revalidate` export, and every HTML request became a cold
 * function call. unstable_cache runs the Redis hop in its own cache scope, so
 * it no longer propagates to the surrounding render.
 *
 * Redis stays underneath it: the Data Cache is per-deployment-region, Redis is
 * shared, and the two TTLs are deliberately the same 30s.
 */
const loadFlagsThroughRedis = unstable_cache(
  () => cacheThrough(CacheKey.platformFlags(), TTL.MIDDLEWARE, loadAllFlags),
  [PLATFORM_FLAGS_TAG],
  { revalidate: TTL.MIDDLEWARE, tags: [PLATFORM_FLAGS_TAG] },
);

/**
 * Whether a platform-wide kill switch is enabled. Unknown keys and DB-read
 * failures both resolve to `true` (fail open) — this table only ever turns
 * things OFF; it must never become a reason things go down on its own.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await loadFlagsThroughRedis();
  return flags[key] ?? true;
}

/**
 * Call after a gridmaster write so the change is visible before TTL expiry.
 * Clears the shared Redis layer; the caller must also `revalidateTag(
 * PLATFORM_FLAGS_TAG)` to clear this deployment's Data Cache — see the note on
 * that constant for why it can't happen here.
 */
export async function invalidatePlatformFlagsCache(): Promise<void> {
  await cacheDel(CacheKey.platformFlags());
}
