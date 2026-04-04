import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client authenticated with the service role key.
 * Use this in Route Handlers and Server Actions that need elevated access
 * (bypassing RLS). Each call creates a fresh client instance.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
