// src/hooks/useLogout.ts
import { supabase } from "@/lib/supabase";
import { parseHost } from "@/lib/subdomain";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { clearOrgDataCache } from "./useOrganizationData";
import { clearEmployeeCache } from "./useEmployees";
import { clearPermsCache } from "./usePermissions";

/**
 * Per-device logout helper.
 * - signOutLocal: this browser/tab only (redirects to apex landing)
 * - signOutOthers: all other devices
 */
export function useLogout() {
  async function signOutLocal(redirectTo?: string): Promise<void> {
    clearOrgDataCache();
    clearEmployeeCache();
    clearPermsCache();
    clearImpersonationCookie();

    // Clean up any active impersonation sessions for this user
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase
          .from("impersonation_sessions")
          .delete()
          .eq("gridmaster_id", session.user.id);
      }
    } catch {
      // Best-effort cleanup — don't block logout
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    sessionStorage.removeItem("dg_user_name");

    if (redirectTo) {
      window.location.replace(redirectTo);
    } else {
      const parsed = parseHost(window.location.host);
      const apexUrl = `${window.location.protocol}//${parsed.rootDomain}${parsed.port}/`;
      window.location.replace(apexUrl);
    }
  }

  async function signOutOthers(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
  }

  return { signOutLocal, signOutOthers };
}
