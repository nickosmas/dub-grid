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
  NEXT_PUBLIC_PERF_TIMING: z.string().optional(),
});

function validateClientEnv() {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: getSupabasePublishableKey(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
    // These four are declared in the schema above but were never passed here,
    // so they always parsed as undefined. Named literally, not looked up in a
    // loop: Next only inlines NEXT_PUBLIC_* for static member access.
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_PERF_TIMING: process.env.NEXT_PUBLIC_PERF_TIMING,
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

type ClientEnv = z.infer<typeof clientSchema>;

let clientMemo: ClientEnv | null | undefined;

/**
 * Resolved lazily rather than snapshotted at import.
 *
 * A module-level const captured process.env once, before any test had a chance
 * to set it, so `vi.stubEnv` was invisible here. That is the real reason so
 * much code read the raw variable instead of this object: reading it through
 * here simply did not work under test. Under test we re-validate per access so
 * stubs are honoured; everywhere else the first result is memoised.
 */
function resolveClientEnv(): ClientEnv | null {
  if (process.env.NODE_ENV === "test") return validateClientEnv();
  if (clientMemo === undefined) clientMemo = validateClientEnv();
  return clientMemo;
}

export const clientEnv = new Proxy({} as ClientEnv, {
  get: (_target, prop: string) => resolveClientEnv()?.[prop as keyof ClientEnv],
  has: (_target, prop: string) => {
    const resolved = resolveClientEnv();
    return resolved ? prop in resolved : false;
  },
}) as ClientEnv | null;
