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
