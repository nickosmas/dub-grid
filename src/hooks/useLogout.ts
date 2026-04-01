// src/hooks/useLogout.ts
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseHost } from "@/lib/subdomain";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { clearPermsCache } from "./usePermissions";

/**
 * Per-device logout helper.
 * - signOutLocal: this browser/tab only (redirects to apex landing)
 * - signOutOthers: all other devices
 */
export function useLogout() {
  const queryClient = useQueryClient();

  async function signOutLocal(redirectTo?: string): Promise<void> {
    queryClient.clear(); // Clears all React Query caches (org data, employees, etc.)
    clearPermsCache(); // usePermissions still uses module-level cache
    clearImpersonationCookie();

    // Best-effort impersonation cleanup — fire-and-forget.
    // Sessions auto-expire after 30 min, so this is non-critical.
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user?: { id: string } } | null } }) => {
      if (session?.user?.id) {
        supabase.from("impersonation_sessions").delete().eq("gridmaster_id", session.user.id);
      }
    }).catch(() => {});

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
