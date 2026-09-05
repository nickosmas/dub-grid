/**
 * Single source for the two Supabase API keys (`sb_publishable_…` /
 * `sb_secret_…`). The legacy `anon` / `service_role` JWTs they replaced were
 * revoked on 2026-08-06, so the transitional fallbacks are gone.
 *
 * Values are read through here rather than `process.env` directly: there was
 * previously no choke point at all, which is what made renaming these a
 * 45-file change.
 *
 * Note the variables are named literally rather than looked up dynamically —
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for static
 * member access.
 */

/** Project API URL. Public by design — it is in the browser bundle already. */
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Client-safe key, published in the browser bundle and the mobile binary. */
export function getSupabasePublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * Server-only key that bypasses RLS. Never expose this to the client or
 * prefix it with `NEXT_PUBLIC_`.
 */
export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}

/** Throwing variants for call sites that cannot proceed without a key. */
export function requireSupabaseUrl(): string {
  const url = getSupabaseUrl();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  }
  return url;
}

export function requireSupabasePublishableKey(): string {
  const key = getSupabasePublishableKey();
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.");
  }
  return key;
}

export function requireSupabaseSecretKey(): string {
  const key = getSupabaseSecretKey();
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set.");
  }
  return key;
}
