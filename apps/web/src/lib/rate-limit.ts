import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedisEnv =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;
const isProduction = process.env.NODE_ENV === "production";

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

/**
 * Demo request rate limiter — 3 requests per hour per key (IP).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const demoLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "1 h") })
  : null;

/**
 * Password reset rate limiter — 5 requests per 15 minutes per key (email hash).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const passwordResetLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m") })
  : null;

/**
 * Login rate limiter — 15 attempts per 15 minutes per key (email hash).
 * Provides brute-force protection at the application level.
 */
export const loginLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, "15 m") })
  : null;

export function getRateLimitConfigStatus(): {
  configured: boolean;
  productionReady: boolean;
  message: string | null;
} {
  if (hasRedisEnv) {
    return { configured: true, productionReady: true, message: null };
  }

  if (isProduction) {
    return {
      configured: false,
      productionReady: false,
      message: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production",
    };
  }

  return {
    configured: false,
    productionReady: true,
    message: "Rate limiting is disabled until Upstash Redis env vars are configured",
  };
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
    if (isProduction) {
      return { limited: true, misconfigured: true };
    }
    return { limited: false };
  }
  const { success, reset } = await limiter.limit(key);
  return { limited: !success, reset };
}
