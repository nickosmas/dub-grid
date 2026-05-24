// src/hooks/useLogout.ts
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Sentry from "@/lib/sentry";
import { beginLogout } from "@/lib/logout-state";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { clearPermsCache } from "@/features/permissions/client";
import {
  clearLogoutCleanup,
  getBrowserRealtimeChannels,
  removeBrowserRealtimeChannel,
  signOutFromBrowser,
  untrackBrowserRealtimeChannel,
} from "@/features/account/client";

/**
 * Remove all per-user / per-session `dg_*` state from both storages so nothing
 * leaks into the next login in the SAME tab: the view-as-user toggle
 * (dg_user_view), cached display name (dg_user_name), onboarding completion /
 * phase / step (dg_onboarding*), and the auth-transition flag (dg_auth_transition).
 * Device-level prefs use a `dg-` (hyphen) prefix or other keys (e.g. cookie
 * consent) and are intentionally preserved.
 */
function clearDubgridSessionState(): void {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith("dg_")) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    } catch {
      // storage unavailable (private mode / SSR) — nothing to clear.
    }
  }
}

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
    // Silence error toasts for the rest of this teardown: clearing the cache +
    // signing out makes in-flight queries fail (401/expired) while the app is
    // still mounted, which would otherwise flash a "session expired" toast.
    beginLogout();
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
      // Clear all per-user/session dg_* state (view-as-user toggle, onboarding
      // flags, auth-transition, cached name) so it can't leak into the next
      // login in the same tab. Generalizes the original M-2 fix.
      clearDubgridSessionState();
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
