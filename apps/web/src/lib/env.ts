import { z } from "zod";
import { getSupabasePublishableKey } from "./supabase-keys";

/**
 * Client-safe environment validation.
 *
 * Only NEXT_PUBLIC_* lives here, because this module is reachable from the
 * browser through lib/supabase.ts. The server schema is in ./env.server, which
 * must never be imported from a client component — see the note there.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
});

function validateClientEnv() {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: getSupabasePublishableKey(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
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

// NEXT_PUBLIC_* vars are inlined by Next.js at build time into every bundle
// (server and client alike), so this validates regardless of runtime context —
// only test env is skipped, to keep vitest output quiet.
export const clientEnv = process.env.NODE_ENV !== "test" ? validateClientEnv() : null;
