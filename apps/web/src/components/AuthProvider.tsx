"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { setSentryUser } from "@/lib/sentry";
import { AuthContext } from "@/lib/auth-context";
export { useAuth } from "@/lib/auth-context";
import {
  clearBrowserAuthState,
  getBrowserAuthSession,
  getVerifiedBrowserAuthUser,
  isRecoverableBrowserAuthFailure,
  signOutFromBrowser,
  subscribeToBrowserAuthChanges,
} from "@/features/account/client";

/**
 * Track session via API route so the server can capture the client IP address.
 * The server keys the row by the Supabase auth session_id claim so web and
 * mobile sessions share the same registry.
 */
async function trackSession() {
  const deviceLabel = parseUserAgent(navigator.userAgent);

  await fetch("/api/auth/track-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "web", deviceLabel }),
  });
}

function parseUserAgent(ua: string): string {
  // Extract browser + OS from user agent string
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";

  let os = "Unknown";
  if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} on ${os}`;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initial session check with timeout — stale cookies from a different
    // Supabase instance (e.g. remote→local switch) can cause getSession()
    // to hang indefinitely on token refresh. The timeout clears the dead
    // session so the app doesn't spin forever.
    const checkSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const isVerifiedLoginHandoff =
          window.location.pathname === "/login" &&
          params.get("verified") === "1";
        if (isVerifiedLoginHandoff) {
          clearBrowserAuthState();
        }

        const sessionPromise = getBrowserAuthSession();
        // 12s, not 5s: a genuine token refresh on a slow network can legitimately
        // take several seconds. 5s lost that race and silently logged the user
        // out; 12s still escapes a truly hung getSession (stale remote↔local
        // cookies) without nuking a session that was merely slow.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("session_timeout")), 12000),
        );
        const initialSession = await Promise.race([sessionPromise, timeoutPromise]);

        const verifiedUser =
          initialSession?.access_token ? await getVerifiedBrowserAuthUser() : null;
        setSession(verifiedUser ? initialSession : null);
        setUser(verifiedUser);
        setSentryUser(
          verifiedUser ? { id: verifiedUser.id, email: verifiedUser.email } : null,
        );

        // Track existing session on page load (session restored from cookies)
        if (initialSession?.refresh_token && verifiedUser) {
          trackSession().catch(() => {});
        }
      } catch (error) {
        // Only WIPE persisted auth for a known-recoverable failure (stale/invalid
        // refresh token), where clearing is the recovery. On a bare timeout the
        // tokens may still be valid (just slow) — don't wipe them, or we'd convert
        // a slow network into a forced logout; just drop the in-memory session so
        // the next mount re-checks and can recover.
        if (isRecoverableBrowserAuthFailure(error)) {
          clearBrowserAuthState();
        }
        setSession(null);
        setUser(null);
        setSentryUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = subscribeToBrowserAuthChanges((event: AuthChangeEvent, nextSession: Session | null) => {
      if (event === "SIGNED_OUT" || !nextSession?.access_token) {
        setSession(null);
        setUser(null);
        setIsLoading(false);
        setSentryUser(null);
        return;
      }

      void (async () => {
        const verifiedUser = await getVerifiedBrowserAuthUser().catch(() => null);
        setSession(verifiedUser ? nextSession : null);
        setUser(verifiedUser);
        setIsLoading(false);
        setSentryUser(
          verifiedUser ? { id: verifiedUser.id, email: verifiedUser.email } : null,
        );

        // No redirect on SIGNED_OUT — signOutLocal() handles the apex redirect,
        // and ProtectedRoute handles session-expiry redirects to /login.
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          nextSession.refresh_token &&
          verifiedUser
        ) {
          trackSession().catch(() => {});
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await signOutFromBrowser("local");
  }, []);

  const contextValue = useMemo(
    () => ({ user, session, signOut, isLoading }),
    [user, session, signOut, isLoading],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
