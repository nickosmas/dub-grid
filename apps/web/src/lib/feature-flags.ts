import { cacheThrough, cacheDel, CacheKey, TTL } from "@/lib/cache";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

type PlatformFlagRow = { key: string; enabled: boolean };

async function loadAllFlags(): Promise<Record<string, boolean>> {
  const { data, error } = await getServiceClient()
    .from("platform_feature_flags")
    .select("key, enabled");

  if (error) {
    // A DB hiccup must never itself act as a kill switch — this table only
    // exists so an admin can turn something off on purpose. Fail open and log
    // loudly so the read failure is visible without taking anything down.
    logger.error({ error }, "platform_feature_flags read failed; treating all flags as enabled");
    return {};
  }

  return Object.fromEntries((data as PlatformFlagRow[]).map((row) => [row.key, row.enabled]));
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
