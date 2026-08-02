import { cacheThrough, cacheDel, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

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
 * Whether a platform-wide kill switch is enabled. Unknown keys and DB-read
 * failures both resolve to `true` (fail open) — this table only ever turns
 * things OFF; it must never become a reason things go down on its own.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const flags = await cacheThrough(CacheKey.platformFlags(), TTL.MIDDLEWARE, loadAllFlags);
  return flags[key] ?? true;
}

/** Call after a gridmaster write so the change is visible before TTL expiry. */
export async function invalidatePlatformFlagsCache(): Promise<void> {
  await cacheDel(CacheKey.platformFlags());
}
