import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the service role key, for Route Handlers
 * and Server Actions that need elevated access (bypassing RLS).
 *
 * Memoized into a single module-level instance: the client carries no
 * per-request state (persistSession:false, autoRefreshToken:false) and is only
 * used for stateless service-role queries and `auth.admin` calls, so sharing it
 * across requests is safe and avoids reconstructing the client + its internal
 * fetch/auth machinery on every one of the ~270 call sites.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
