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

function createSlidingWindowLimiter(
  limit: number,
  window: `${number} ${"s" | "m" | "h"}`,
) {
  return redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window) })
    : null;
}

/**
 * Public API rate limiter — 10 requests per 10 seconds per key (IP).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const apiLimiter = createSlidingWindowLimiter(10, "10 s");

/**
 * Schedule review limiter — 60 requests per 10 seconds per user.
 * Publish/discard review dialogs may refresh repeatedly across tabs, so they
 * need more headroom than the generic protected-route limiter.
 */
export const scheduleReviewLimiter = createSlidingWindowLimiter(60, "10 s");

/**
 * Invite email rate limiter — 100 requests per hour per key (user ID).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const inviteLimiter = createSlidingWindowLimiter(100, "1 h");

/**
 * Demo request rate limiter — 3 requests per hour per key (IP).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const demoLimiter = createSlidingWindowLimiter(3, "1 h");

/**
 * Test-sandbox creation rate limiter — 3 requests per hour per user.
 * Sandbox creation is expensive (clones org config + seeds data).
 */
export const testSandboxLimiter = createSlidingWindowLimiter(3, "1 h");

/**
 * Password reset rate limiter — 5 requests per 15 minutes per key (email hash).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const passwordResetLimiter = createSlidingWindowLimiter(5, "15 m");

/**
 * Login rate limiter — 15 attempts per 15 minutes per key (email hash).
 * Provides brute-force protection at the application level.
 */
export const loginLimiter = createSlidingWindowLimiter(15, "15 m");

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
