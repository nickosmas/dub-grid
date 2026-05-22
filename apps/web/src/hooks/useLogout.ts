// src/hooks/useLogout.ts
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Sentry from "@/lib/sentry";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { clearPermsCache } from "@/features/permissions/client";
import {
  clearLogoutCleanup,
  getBrowserRealtimeChannels,
  removeBrowserRealtimeChannel,
  signOutFromBrowser,
  untrackBrowserRealtimeChannel,
} from "@/features/account/client";

async function clearRealtimeChannels(): Promise<void> {
  const channels = getBrowserRealtimeChannels() as RealtimeChannel[];

  await Promise.allSettled(
    channels.map(async (channel) => {
      try {
        if (channel.state === "joined") {
          await untrackBrowserRealtimeChannel(channel);
        }
      } catch {
        // Logout should continue even if realtime cleanup fails.
      }

      try {
        await removeBrowserRealtimeChannel(channel);
      } catch {
        // Ignore channel teardown failures during logout.
      }
    }),
  );
}

/**
 * Per-device logout helper.
 * - signOutLocal: this browser/tab only — clears the session and lands on the
 *   sign-in page (`/login`), swiftly and with no transition splash.
 * - signOutOthers: all other devices
 */
export function useLogout() {
  const queryClient = useQueryClient();

  async function signOutLocal(redirectTo = "/login"): Promise<void> {
    // Best-effort teardown. Each step is non-critical to the redirect — if any
    // throws we still navigate away in `finally` so the user is never stranded
    // (a thrown signOut was what left logout stuck before).
    try {
      queryClient.clear(); // Clears all React Query caches (org data, employees, etc.)
      clearPermsCache(); // usePermissions still uses module-level cache
      clearImpersonationCookie();

      // Best-effort impersonation cleanup — fire-and-forget.
      // Sessions auto-expire after 30 min, so this is non-critical.
      void clearLogoutCleanup().catch(() => {});

      await clearRealtimeChannels();
      await signOutFromBrowser("local");
      sessionStorage.removeItem("dg_user_name");
    } catch (err) {
      Sentry.captureException(err);
    } finally {
      window.location.replace(redirectTo);
    }
  }

  async function signOutOthers(): Promise<void> {
    await signOutFromBrowser("others");
  }

  return { signOutLocal, signOutOthers };
}
