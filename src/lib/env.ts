import { z } from "zod";

/**
 * Centralized environment variable validation.
 * Imported at startup to fail fast on misconfiguration.
 */

const isStrictProductionEnv =
  process.env.NODE_ENV === "production" &&
  (process.env.VERCEL_ENV === "production" ||
    process.env.STRICT_PROD_ENV_VALIDATION === "1");

const serverSchema = z
  .object({
    // Note: SUPABASE_JWT_SECRET is no longer required — JWT verification uses JWKS
    // (ES256 asymmetric keys fetched from Supabase's .well-known/jwks.json endpoint).
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
    RESEND_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID_MONTHLY: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    if (!isStrictProductionEnv) return;

    if (!env.UPSTASH_REDIS_REST_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_URL is required in production",
        path: ["UPSTASH_REDIS_REST_URL"],
      });
    }

    if (!env.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_TOKEN is required in production",
        path: ["UPSTASH_REDIS_REST_TOKEN"],
      });
    }
  });

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
});

function validateServerEnv() {
  // Only validate server env in server context (not in browser)
  if (typeof window !== "undefined") return null;

  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    if (isStrictProductionEnv) {
      console.error(
        "[env] Server environment validation failed:\n",
        result.error.flatten().fieldErrors,
      );
      throw new Error("Missing required server environment variables. Check logs for details.");
    }
    // Warn in dev so misconfigurations are noticed early
    console.warn(
      "[env] Server environment validation issues (non-fatal in dev):\n",
      result.error.flatten().fieldErrors,
    );
    return null;
  }
  return result.data;
}

function validateClientEnv() {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  });
  if (!result.success) {
    console.error(
      "[env] Client environment validation failed:\n",
      result.error.flatten().fieldErrors,
    );
    // Don't throw in client — graceful degradation
    return null;
  }
  return result.data;
}

export const serverEnv = validateServerEnv();
export const clientEnv =
  typeof window !== "undefined" && process.env.NODE_ENV !== "test"
    ? validateClientEnv()
    : null;
