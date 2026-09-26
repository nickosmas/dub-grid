"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Sentry from "@/lib/sentry";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { settleWithRequestTimeout } from "@/lib/fetch-with-timeout";
import {
  clearLogoutCleanup,
  getBrowserRealtimeChannels,
  removeBrowserRealtimeChannel,
  signOutFromBrowser,
  untrackBrowserRealtimeChannel,
} from "@/features/account/client";

// Short, because the user is waiting on a sign-out screen for these.
const PRE_SIGN_OUT_DEADLINE_MS = 3_000;
export type LogoutScope = "local" | "global";

interface RunLogoutTeardownProps {
  /**
   * Sign-out scope from `?scope=` on the URL. `null` means the user landed on
   * /goodbye directly (e.g. via bookmark) — no teardown runs and the CTAs are
   * enabled immediately.
   */
  scope: LogoutScope | null;
  /**
   * Why the sign-out happened, from `?reason=` on the URL. A known reason
   * surfaces a persistent explanatory toast that stays up until the user
   * dismisses it, clicks "Sign back in", or navigates elsewhere (any of which
   * unmounts this component and clears the toast).
   */
  reason?: LogoutReason | null;
}

export type LogoutReason = "inactivity" | "password-changed" | "password-unconfirmed";

const REASON_MESSAGES: Record<LogoutReason, string> = {
  inactivity: "You were signed out after 30 minutes of inactivity.",
  "password-changed":
    "Your password changed, so we signed you out everywhere. Sign in with your new password.",
  // The change may have landed after the deadline, so every session was
  // signed out as if it had (41b2).
  "password-unconfirmed":
    "We couldn't confirm your new password, so we signed you out everywhere. Sign in with your new password. If it doesn't work, use your previous one.",
};

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
  const passwordReason = reason === "password-changed" || reason === "password-unconfirmed";
  // A password notice says everything was signed out, so it waits for that
  // sign-out to succeed, and a local scope never shows one (41b2/F-04).
  const [passwordSignedOut, setPasswordSignedOut] = useState(false);
  const showReason = reason === "inactivity" || (passwordReason && passwordSignedOut);

  useEffect(() => {
    if (!reason || !showReason) return;
    const id = toast.info(REASON_MESSAGES[reason], {
      duration: Infinity,
    });
    // Clear it the moment the user leaves /goodbye (clicking "Sign back in"
    // or navigating anywhere else unmounts this component).
    return () => {
      toast.dismiss(id);
    };
  }, [reason, showReason]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (scope === null) return;

    void (async () => {
      // Cleanup needs the session, so it runs first, but it can never hold
      // revocation back: a stalled request used to leave sign-out waiting
      // forever with the access token still live (finding F-20).
      try {
        queryClient.clear();
        clearImpersonationCookie();
        await settleWithRequestTimeout(clearLogoutCleanup(), PRE_SIGN_OUT_DEADLINE_MS).catch(() => {
          // Best-effort; a timed-out session no longer grants access either way.
        });
        await settleWithRequestTimeout(clearRealtimeChannels(), PRE_SIGN_OUT_DEADLINE_MS);
      } catch (err) {
        Sentry.captureException(err);
      }
      try {
        // A password change is recorded as one in the audit trail.
        if (scope === "global" && passwordReason) {
          await signOutFromBrowser(scope, "password_change");
          setPasswordSignedOut(true);
        } else {
          await signOutFromBrowser(scope);
        }
      } catch (err) {
        Sentry.captureException(err);
        if (scope === "global") {
          // A password change keeps its advice when the sign-out fails (F-10).
          toast.error(
            reason === "password-changed"
              ? "Your password changed, but we couldn't sign out every device. Sign in with your new password and review your sessions."
              : reason === "password-unconfirmed"
                ? "We couldn't confirm your new password or sign out every device. Sign in with your new password, or your previous one if it doesn't work, then review your sessions."
                : "We couldn't confirm sign-out on every device. Sign back in to review your sessions.",
          );
        }
        // Best-effort. User is on /goodbye and the session is at least
        // partially cleared; signing back in will reset everything.
      } finally {
        clearDubgridSessionState();
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
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {done ? (
        <Link href="/login" className="dg-btn dg-btn-primary dg-btn-lg">
          Sign back in
        </Link>
      ) : (
        <button type="button" className="dg-btn dg-btn-primary dg-btn-lg" disabled aria-busy="true">
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
