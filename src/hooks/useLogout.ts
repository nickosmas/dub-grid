// src/hooks/useLogout.ts
import { supabase } from "@/lib/supabase";

/**
 * Per-device logout helper.
 * - signOutLocal: this browser/tab only
 * - signOutOthers: all other devices
 */
export function useLogout() {
  async function signOutLocal(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    window.location.href = "/";
  }

  async function signOutOthers(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
  }

  return { signOutLocal, signOutOthers };
}
