import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedisEnv =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

function createRedis() {
  if (!hasRedisEnv) return null;
  return Redis.fromEnv();
}

const redis = createRedis();

/**
 * Public API rate limiter — 10 requests per 10 seconds per key (IP).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const apiLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 s") })
  : null;

/**
 * Invite email rate limiter — 100 requests per hour per key (user ID).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const inviteLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "1 h") })
  : null;

if (!hasRedisEnv) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[rate-limit] CRITICAL: UPSTASH_REDIS_REST_URL / TOKEN not set in production — requests will be blocked",
    );
  } else {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL / TOKEN not set — rate limiting disabled (dev)",
    );
  }
}

/**
 * Check rate limit. In production, fails closed (blocks) when Redis is not
 * configured, signalling `misconfigured` so callers can return 503 instead of 429.
 * In development, allows through for convenience.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<{ limited: boolean; reset?: number; misconfigured?: boolean }> {
  if (!limiter) {
    // Fail-closed in production: missing Redis = service unavailable (not "too many requests")
    if (process.env.NODE_ENV === "production") {
      return { limited: true, misconfigured: true };
    }
    return { limited: false };
  }
  const { success, reset } = await limiter.limit(key);
  return { limited: !success, reset };
}
