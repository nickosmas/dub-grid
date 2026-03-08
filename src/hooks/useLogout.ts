// src/hooks/useLogout.ts
import { supabase } from "@/lib/supabase";
import { parseHost } from "@/lib/subdomain";

/**
 * Per-device logout helper.
 * - signOutLocal: this browser/tab only (redirects to apex landing)
 * - signOutOthers: all other devices
 */
export function useLogout() {
  async function signOutLocal(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    const parsed = parseHost(window.location.host);
    const apexUrl = `${window.location.protocol}//${parsed.rootDomain}${parsed.port}/`;
    window.location.replace(apexUrl);
  }

  async function signOutOthers(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
  }

  return { signOutLocal, signOutOthers };
}
