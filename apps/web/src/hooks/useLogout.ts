// src/hooks/useLogout.ts
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getVerifiedBrowserUser } from "@/lib/browser-auth";
import { parseHost } from "@/lib/subdomain";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { clearPermsCache } from "@/features/permissions/client";

async function clearRealtimeChannels(): Promise<void> {
  const channels =
    typeof supabase.getChannels === "function"
      ? (supabase.getChannels() as RealtimeChannel[])
      : [];

  await Promise.allSettled(
    channels.map(async (channel) => {
      try {
        if (channel.state === "joined") {
          await channel.untrack();
        }
      } catch {
        // Logout should continue even if realtime cleanup fails.
      }

      try {
        await supabase.removeChannel(channel);
      } catch {
        // Ignore channel teardown failures during logout.
      }
    }),
  );
}

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
    getVerifiedBrowserUser().then((user) => {
      if (user?.id) {
        supabase.from("impersonation_sessions").delete().eq("gridmaster_id", user.id);
      }
    }).catch(() => {});

    await clearRealtimeChannels();

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
