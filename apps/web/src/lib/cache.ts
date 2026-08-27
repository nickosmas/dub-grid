import { Redis } from "@upstash/redis";
import { withTimeout } from "@/lib/with-timeout";

// ── TTL Constants ────────���─────────────────────���────────────────────────
export const TTL = {
  /** 5 minutes — org config entities (focus areas, shifts, jobs, etc.) */
  STABLE: 300,
  /** 2 minutes — employees, users, invitations */
  MODERATE: 120,
  /** 30 seconds — middleware profile/membership fallback */
  MIDDLEWARE: 30,
  /**
   * 1 hour — auth revocation markers (see lib/auth/revocation.ts). Must be at
   * least the access-token lifetime (`jwt_expiry` in supabase/config.toml): a
   * marker only has to outlive the tokens it invalidates, because past that
   * point the token is expired and local verification rejects it anyway.
   */
  ACCESS_TOKEN: 3600,
  /**
   * 24 hours — public, unauthenticated subdomain→org lookup. Safe this long
   * because organizations.slug is write-once (set at creation, never
   * rewritten); the cached `name` is invalidated explicitly on rename
   * (organizations/settings/route.ts) and on archive
   * (organizations/delete/route.ts) rather than relying on TTL expiry.
   */
  PUBLIC_LOOKUP: 86400,
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
  assignments: (orgId: string, all = false) => `dg:org:${orgId}:assignments${all ? ":all" : ""}`,
  jobs: (orgId: string, all = false) => `dg:org:${orgId}:jobs${all ? ":all" : ""}`,
  absenceTypes: (orgId: string, all = false) => `dg:org:${orgId}:absenceTypes${all ? ":all" : ""}`,
  shiftCategories: (orgId: string) => `dg:org:${orgId}:shiftCategories`,
  indicatorTypes: (orgId: string) => `dg:org:${orgId}:indicatorTypes`,
  certifications: (orgId: string) => `dg:org:${orgId}:certifications`,
  orgRoles: (orgId: string) => `dg:org:${orgId}:orgRoles`,
  departments: (orgId: string) => `dg:org:${orgId}:departments`,
  coverageReqs: (orgId: string) => `dg:org:${orgId}:coverageRequirements`,
  organization: (orgId: string) => `dg:org:${orgId}:organization`,
  /**
   * Authorized bootstrap's shared, organization-only configuration fan-out.
   * Never contains memberships, permissions, session state, employee records,
   * or Test Sandbox context.
   */
  bootstrapConfig: (orgId: string) => `dg:org:${orgId}:bootstrapConfig`,
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
  mwMembership: (userId: string, slug: string) => `dg:mw:membership:${userId}:${slug}`,
  mwOrgSuspended: (orgId: string) => `dg:mw:orgSuspended:${orgId}`,
  mwOrgAccess: (orgId: string) => `dg:mw:orgAccess:${orgId}`,

  // Public subdomain lookup (validate-domain)
  orgBySlug: (slug: string) => `dg:org:slug:${slug}`,

  // Platform-wide kill switches (see lib/feature-flags.ts)
  platformFlags: () => `dg:platform:featureFlags`,

  /**
   * Whether an org has finished setup (see requireOrgPermissions). Only ever
   * holds `true` — see the note at its one write site for why caching the
   * `false` is the one thing this must not do.
   */
  orgSetupComplete: (orgId: string) => `dg:org:${orgId}:setupComplete`,

  // ── Auth revocation (see lib/auth/revocation.ts) ──────────────────────
  /** One device signed out or revoked. Presence alone means "reject". */
  revokedSession: (sessionId: string) => `dg:auth:revoked:session:${sessionId}`,
  /**
   * Epoch-ms watermark. Every token this user holds that was issued before it
   * is rejected — for changes that must invalidate all devices at once
   * (account disabled, membership removed, role changed).
   */
  revokedAfter: (userId: string) => `dg:auth:revokedAfter:user:${userId}`,
} as const;

// ── Typed Cache Operations ──────────────────────────────────────────────

const _debugMode = process.env.NODE_ENV === "development";

/**
 * How long any single Redis operation may hold a request.
 *
 * Upstash is a network hop, and the client has no timeout of its own — a slow
 * or half-open connection would otherwise hold the request open indefinitely.
 * That is not hypothetical: it is exactly how the subdomain form ends up
 * spinning forever, because nothing rejects and so nothing recovers.
 *
 * A read that times out returns a miss, which every caller already handles: it
 * falls through to the source of truth. The budget is generous enough that only
 * a genuinely unhealthy Redis trips it.
 */
const REDIS_TIMEOUT_MS = 1_500;

/**
 * Get a cached value by key. Returns null on miss or Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await withTimeout(client.get<T>(key), REDIS_TIMEOUT_MS, null);
    return raw ?? null;
  } catch (err) {
    if (_debugMode) {
      console.warn(`[cache] GET failed for ${key}:`, err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/**
 * Get several keys in one round trip. Returns an array positionally matching
 * `keys`, with null for a miss. Returns all-null on Redis unavailable, same as
 * `cacheGet` — callers must treat that as "no cached answer", never as a
 * meaningful value.
 */
export async function cacheGetMany<T>(keys: string[]): Promise<(T | null)[]> {
  const client = getRedis();
  if (!client || keys.length === 0) return keys.map(() => null);
  try {
    const raw = await withTimeout(client.mget<T[]>(...keys), REDIS_TIMEOUT_MS, null);
    return keys.map((_, i) => raw?.[i] ?? null);
  } catch (err) {
    if (_debugMode) {
      console.warn(`[cache] MGET failed:`, err instanceof Error ? err.message : err);
    }
    return keys.map(() => null);
  }
}

/**
 * Set a cached value with TTL. Fails silently if Redis unavailable.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await withTimeout(client.set(key, value, { ex: ttlSeconds }), REDIS_TIMEOUT_MS, null);
  } catch (err) {
    if (_debugMode) {
      console.warn(`[cache] SET failed for ${key}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Delete one or more cache keys. Fails silently.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;
  // The bootstrap cache is a short-lived aggregate of these individual
  // organization configuration resources. Derive its invalidation here so
  // every existing config writer remains correct without having to remember a
  // second cache key. Deliberately exclude users, sessions, memberships, and
  // employee keys: none are part of the aggregate.
  const bootstrapKeys = keys.flatMap((key) => {
    const match =
      /^dg:org:([^:]+):(organization|focusAreas|shiftCategories|jobs|indicatorTypes|certifications|orgRoles|departments|coverageRequirements|absenceTypes)(?::.*)?$/.exec(
        key,
      );
    return match ? [CacheKey.bootstrapConfig(match[1])] : [];
  });
  const keysToDelete = [...new Set([...keys, ...bootstrapKeys])];
  try {
    await withTimeout(client.del(...keysToDelete), REDIS_TIMEOUT_MS, null);
  } catch (err) {
    if (_debugMode) {
      console.warn(`[cache] DEL failed:`, err instanceof Error ? err.message : err);
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
