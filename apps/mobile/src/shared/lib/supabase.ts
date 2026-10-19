import { createClient, type Session } from "@supabase/supabase-js";
import { getMobileEnvConfig } from "./env";
import { secureStoreAdapter } from "./session";

let supabaseClient: ReturnType<typeof createClient> | null = null;

export type { Session };

export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const env = getMobileEnvConfig();
  supabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: secureStoreAdapter,
    },
  });

  return supabaseClient;
}

/**
 * Starts reading (and, if it expired, refreshing) the stored session at
 * launch, so it overlaps font loading. `AuthSessionProvider` later asks for
 * the same session and gets this work's result instead of starting it.
 */
export function warmSupabaseSession(): void {
  try {
    void getSupabaseClient()
      .auth.getSession()
      .catch(() => undefined);
  } catch {
    // Invalid configuration: the configuration screen reports it.
  }
}

export function createEphemeralSupabaseClient() {
  const env = getMobileEnvConfig();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
