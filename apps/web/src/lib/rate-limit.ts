import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * SHA-256 of a normalized email, for use as a rate-limit key without storing
 * the raw address in Redis (matches the login route's hashing).
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

const hasRedisEnv = !!serverEnv?.UPSTASH_REDIS_REST_URL && !!serverEnv?.UPSTASH_REDIS_REST_TOKEN;
const isProduction = process.env.NODE_ENV === "production";

function createRedis() {
  if (!hasRedisEnv) return null;
  return Redis.fromEnv();
}

const redis = createRedis();

function createSlidingWindowLimiter(limit: number, window: `${number} ${"s" | "m" | "h"}`) {
  return redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window) }) : null;
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
 * Password reset rate limiter — 5 requests per 15 minutes per key (email hash).
 * Returns `{ success: true }` if Redis is not configured (local dev).
 */
export const passwordResetLimiter = createSlidingWindowLimiter(5, "15 m");

/**
 * Login rate limiter — 15 attempts per 15 minutes per key (email hash).
 * Provides brute-force protection at the application level.
 */
export const loginLimiter = createSlidingWindowLimiter(15, "15 m");

/**
 * Per-TARGET-email limiter — 5 emails per hour to a single recipient, keyed by
 * `hashEmail(targetEmail)`. Layers on top of the per-actor limiters so one
 * actor can't flood a single inbox (invite/password-reset email bombing).
 */
export const emailTargetLimiter = createSlidingWindowLimiter(5, "1 h");

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
  // Outside production, allow through without the round trip. This used to be
  // true only when Redis was unconfigured, so a developer who had Upstash
  // configured locally paid a full network hop on every rate-limited request —
  // most visibly on sign-in, where it was the single largest cost. Set
  // RATE_LIMIT_IN_DEV=1 to exercise the limiter locally.
  if (!isProduction && process.env.RATE_LIMIT_IN_DEV !== "1") {
    return { limited: false };
  }

  if (!limiter) {
    // Fail-closed in production: missing Redis = service unavailable (not "too many requests")
    if (isProduction) {
      const message = "Rate limiter unavailable: no Redis configured in production";
      logger.error(message);
      Sentry.captureMessage(message, "error");
      return { limited: true, misconfigured: true };
    }
    return { limited: false };
  }
  try {
    const { success, reset } = await limiter.limit(key);
    return { limited: !success, reset };
  } catch (err) {
    // Redis/Upstash unreachable. Don't let it escape as a framework 500 from
    // whatever callsite invoked us (some call before their try block). Fail
    // closed in production (treat like misconfigured → 503), open in dev. (M-3)
    if (isProduction) {
      const message = "Rate limiter check failed (Redis/Upstash unreachable)";
      logger.error({ error: err }, message);
      // captureException (not captureMessage) so the real error — DNS failure vs.
      // auth failure vs. timeout — is attached instead of just a fixed string.
      // Sentry still groups these by exception type + this call site.
      Sentry.captureException(err, { extra: { context: "rate-limit-check" } });
      return { limited: true, misconfigured: true };
    }
    return { limited: false };
  }
}
