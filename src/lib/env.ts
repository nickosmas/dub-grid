import { z } from "zod";

/**
 * Centralized environment variable validation.
 * Imported at startup to fail fast on misconfiguration.
 */

const serverSchema = z.object({
  SUPABASE_JWT_SECRET: z.string().min(32, "SUPABASE_JWT_SECRET must be at least 32 characters"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  RESEND_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().optional(),
});

function validateServerEnv() {
  // Only validate server env in server context (not in browser)
  if (typeof window !== "undefined") return null;

  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    if (process.env.NODE_ENV === "production") {
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
export const clientEnv = validateClientEnv();
