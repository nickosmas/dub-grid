import { Redis } from "@upstash/redis";

// ── TTL Constants ────────���─────────────────────���────────────────────────
export const TTL = {
  /** 5 minutes — org config entities (focus areas, shift codes, etc.) */
  STABLE: 300,
  /** 2 minutes — employees, users, invitations */
  MODERATE: 120,
  /** 30 seconds — middleware profile/membership fallback */
  MIDDLEWARE: 30,
} as const;

// ── Redis Client (lazy singleton) ───────────────────────────────────────
let redis: Redis | null = null;
let redisChecked = false;

function getRedis(): Redis | null {
  if (redisChecked) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisChecked = true;
    return null;
  }
  redis = Redis.fromEnv();
  redisChecked = true;
  return redis;
}

// ── Key Builders ───────────��────────────────────────────���───────────────
export const CacheKey = {
  // Stable org config
  focusAreas: (orgId: string) => `dg:org:${orgId}:focusAreas`,
  shiftCodes: (orgId: string, all = false) =>
    `dg:org:${orgId}:shiftCodes${all ? ":all" : ""}`,
  absenceTypes: (orgId: string, all = false) =>
    `dg:org:${orgId}:absenceTypes${all ? ":all" : ""}`,
  shiftCategories: (orgId: string) => `dg:org:${orgId}:shiftCategories`,
  indicatorTypes: (orgId: string) => `dg:org:${orgId}:indicatorTypes`,
  certifications: (orgId: string) => `dg:org:${orgId}:certifications`,
  orgRoles: (orgId: string) => `dg:org:${orgId}:orgRoles`,
  departments: (orgId: string) => `dg:org:${orgId}:departments`,
  coverageReqs: (orgId: string) => `dg:org:${orgId}:coverageRequirements`,
  organization: (orgId: string) => `dg:org:${orgId}:organization`,
  allOrganizations: () => `dg:gm:allOrganizations`,

  // Moderate
  employees: (orgId: string) => `dg:org:${orgId}:employees`,
  orgUsers: (orgId: string) => `dg:org:${orgId}:orgUsers`,
  orgDirectory: (orgId: string) => `dg:org:${orgId}:orgDirectory`,
  invitations: (orgId: string) => `dg:org:${orgId}:invitations`,
  employeeDetail: (empId: string) => `dg:emp:${empId}:detail`,
  allUsers: () => `dg:gm:allUsers`,
  tenantStats: () => `dg:gm:tenantStats`,

  // Middleware
  mwProfile: (userId: string) => `dg:mw:profile:${userId}`,
  mwMembership: (userId: string, slug: string) =>
    `dg:mw:membership:${userId}:${slug}`,
  mwOrgSuspended: (orgId: string) => `dg:mw:orgSuspended:${orgId}`,
} as const;

// ── Typed Cache Operations ──────────────────────────────────────────────

const _debugMode = process.env.NODE_ENV === "development";

/**
 * Get a cached value by key. Returns null on miss or Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get<T>(key);
    return raw ?? null;
  } catch (err) {
    if (_debugMode) {
      console.warn(
        `[cache] GET failed for ${key}:`,
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}

/**
 * Set a cached value with TTL. Fails silently if Redis unavailable.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    if (_debugMode) {
      console.warn(
        `[cache] SET failed for ${key}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Delete one or more cache keys. Fails silently.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    if (_debugMode) {
      console.warn(
        `[cache] DEL failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Cache-aside helper: try cache first, fall through to fetcher on miss.
 * This is the primary integration point for db.ts functions.
 */
export async function cacheThrough<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    if (_debugMode) console.debug(`[cache] HIT ${key}`);
    return cached;
  }
  if (_debugMode) console.debug(`[cache] MISS ${key}`);
  const data = await fetcher();
  // Fire-and-forget — don't block the response on cache write
  cacheSet(key, data, ttlSeconds).catch(() => {});
  return data;
}
