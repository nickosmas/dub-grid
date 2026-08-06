/**
 * Single source for the two Supabase API keys.
 *
 * Supabase's newer key format (`sb_publishable_…` / `sb_secret_…`) replaces the
 * legacy `anon` / `service_role` JWTs. The names changed with it, so each getter
 * reads the new variable and falls back to the legacy one.
 *
 * The fallback exists so a deploy and an env-var update do not have to land in
 * the same instant: whichever goes first, the app keeps resolving a key. Drop
 * the legacy half once every environment (Vercel, GitHub Actions, and each
 * `.env*`) has been switched over — see docs/secrets-rotation.md.
 *
 * The values are read through here rather than `process.env` directly because
 * there was previously no choke point at all: sixteen call sites each reached
 * for the variable by name, which is what made renaming them a 45-file change.
 *
 * Note both variables are named literally rather than looked up dynamically —
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for static
 * member access.
 */

/** Client-safe key. Formerly `NEXT_PUBLIC_SUPABASE_ANON_KEY`. */
export function getSupabasePublishableKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Server-only key that bypasses RLS. Formerly `SUPABASE_SERVICE_ROLE_KEY`.
 * Never expose this to the client or prefix it with `NEXT_PUBLIC_`.
 */
export function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Throwing variants for call sites that cannot proceed without a key. */
export function requireSupabasePublishableKey(): string {
  const key = getSupabasePublishableKey();
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return key;
}

export function requireSupabaseSecretKey(): string {
  const key = getSupabaseSecretKey();
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set (legacy: SUPABASE_SERVICE_ROLE_KEY).");
  }
  return key;
}
