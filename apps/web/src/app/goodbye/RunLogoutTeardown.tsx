"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
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

export type LogoutScope = "local" | "global";

interface RunLogoutTeardownProps {
  /**
   * Sign-out scope from `?scope=` on the URL. `null` means the user landed on
   * /goodbye directly (e.g. via bookmark) — no teardown runs and the CTAs are
   * enabled immediately.
   */
  scope: LogoutScope | null;
  /**
   * Why the sign-out happened, from `?reason=` on the URL. When "inactivity",
   * this page shows a dismissible explanatory notice.
   */
  reason?: "inactivity" | null;
}

/**
 * Runs the real logout teardown on /goodbye mount.
 *
 * `useLogout`'s `signOut()` hard-navigates here without doing any session work.
 * Performing the teardown on this page (a public route with no ProtectedRoute /
 * OnboardingGate intercepting) avoids:
 *   - the redirect race where ProtectedRoute bounces to /login the moment
 *     cookies clear on the previous page,
 *   - the Supabase auth-lock contention where AuthProvider's re-renders during
 *     teardown acquire the same lock signOutFromBrowser is holding.
 *
 * Also renders the bottom CTA pair (Sign back in / Back to home) so they can
 * be disabled until teardown completes — otherwise a user clicking "Sign back
 * in" mid-teardown would still have valid cookies and bounce straight back
 * into the app.
 */
export function RunLogoutTeardown({ scope, reason = null }: RunLogoutTeardownProps) {
  const queryClient = useQueryClient();
  // StrictMode + Turbopack dev double-mount guard. Without this we call
  // signOutFromBrowser twice and recreate the lock contention the redesign
  // exists to avoid.
  const ranRef = useRef(false);
  const [done, setDone] = useState(scope === null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (scope === null) return;

    void (async () => {
      try {
        queryClient.clear();
        clearPermsCache();
        clearImpersonationCookie();
        // Auth-required cleanup MUST run before signOut clears the session.
        await clearLogoutCleanup().catch(() => {
          // Best-effort; sessions auto-expire after 30 min server-side.
        });
        await clearRealtimeChannels();
        await signOutFromBrowser(scope);
        clearDubgridSessionState();
      } catch (err) {
        Sentry.captureException(err);
        // Best-effort. User is on /goodbye and the session is at least
        // partially cleared; signing back in will reset everything.
      } finally {
        // Drop ?scope= from the URL so a refresh doesn't re-run teardown.
        // Use history.replaceState (not router.replace) — the page is
        // force-dynamic, so router.replace would trigger an RSC fetch and
        // re-run the server component, picking a fresh random headline and
        // visibly swapping the greeting in front of the user. The page
        // doesn't fire any further router calls so the router's stale
        // internal URL is moot.
        try {
          window.history.replaceState(null, "", "/goodbye");
        } catch {
          // history unavailable (very old browser) — ?scope= stays; a refresh
          // would re-run teardown, which is a no-op on a cleared session.
        }
        setDone(true);
      }
    })();
  }, [scope, queryClient]);

  // Keep the same label throughout — text-swapping from "Signing you out…"
  // to "Sign back in" reads as a flash. The disabled button shares the same
  // visual footprint as the Link so there's no layout shift either.
  const primaryStyle = {
    padding: "16px 36px",
    width: "auto",
    whiteSpace: "nowrap" as const,
    display: "inline-flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    textDecoration: "none" as const,
    fontSize: "var(--dg-fs-body)",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {reason === "inactivity" && !noticeDismissed && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            width: "100%",
            marginBottom: 28,
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--color-info-bg)",
            border: "1px solid var(--color-info-border)",
            color: "var(--color-info-text)",
            fontSize: "var(--dg-fs-footnote)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ flex: 1 }}>
            You were signed out after 30 minutes of inactivity.
          </span>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 2,
              margin: 0,
              color: "inherit",
              cursor: "pointer",
              opacity: 0.7,
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {done ? (
        <Link href="/login" className="dg-auth-submit" style={primaryStyle}>
          Sign back in
        </Link>
      ) : (
        <button
          type="button"
          className="dg-auth-submit"
          disabled
          aria-busy="true"
          style={primaryStyle}
        >
          Sign back in
        </button>
      )}
    </div>
  );
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
 * Remove all per-user / per-session `dg_*` state from both storages so nothing
 * leaks into the next login in the SAME tab: the view-as-user toggle
 * (dg_user_view), cached display name (dg_user_name), onboarding completion /
 * phase / step (dg_onboarding*). Device-level prefs use a `dg-` (hyphen) prefix
 * or other keys (e.g. cookie consent) and are intentionally preserved.
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
