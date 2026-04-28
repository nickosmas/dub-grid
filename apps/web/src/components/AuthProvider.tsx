"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { setSentryUser } from "@/lib/sentry";
import {
  clearBrowserAuthState,
  getBrowserAuthSession,
  getVerifiedBrowserAuthUser,
  isRecoverableBrowserAuthFailure,
  signOutFromBrowser,
  subscribeToBrowserAuthChanges,
} from "@/features/account/client";

interface AuthContextType {
  user: User | null;
  signOut: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Track session via API route so the server can capture the client IP address.
 * Uses a stable per-browser session ID (stored in localStorage) so token refreshes
 * update the existing row instead of creating duplicates.
 */
async function trackSession(userId: string) {
  // Generate a stable session ID per browser — persists across refreshes/tabs
  const storageKey = `dg_session_id:${userId}`;
  let sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(storageKey, sessionId);
  }

  // Hash the session ID for storage (the UNIQUE column is refresh_token_hash, repurposed as session fingerprint)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(sessionId));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const deviceLabel = parseUserAgent(navigator.userAgent);

  await fetch("/api/auth/track-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshTokenHash: hashHex, deviceLabel }),
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("session_timeout")), 5000),
        );
        const session = await Promise.race([sessionPromise, timeoutPromise]);

        const verifiedUser =
          session?.access_token ? await getVerifiedBrowserAuthUser() : null;
        setUser(verifiedUser);
        setSentryUser(
          verifiedUser ? { id: verifiedUser.id, email: verifiedUser.email } : null,
        );

        // Track existing session on page load (session restored from cookies)
        if (session?.refresh_token && verifiedUser) {
          trackSession(verifiedUser.id).catch(() => {});
        }
      } catch (error) {
        // Timeout or stale auth state — clear persisted browser auth so the app
        // can recover cleanly on the next login attempt without noisy refresh-token errors.
        if (isRecoverableBrowserAuthFailure(error) || (error instanceof Error && error.message === "session_timeout")) {
          clearBrowserAuthState();
        }
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
    } = subscribeToBrowserAuthChanges((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT" || !session?.access_token) {
        setUser(null);
        setIsLoading(false);
        setSentryUser(null);
        return;
      }

      void (async () => {
        const verifiedUser = await getVerifiedBrowserAuthUser().catch(() => null);
        setUser(verifiedUser);
        setIsLoading(false);
        setSentryUser(
          verifiedUser ? { id: verifiedUser.id, email: verifiedUser.email } : null,
        );

        // No redirect on SIGNED_OUT — signOutLocal() handles the apex redirect,
        // and ProtectedRoute handles session-expiry redirects to /login.
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session.refresh_token &&
          verifiedUser
        ) {
          trackSession(verifiedUser.id).catch(() => {});
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
    () => ({ user, signOut, isLoading }),
    [user, signOut, isLoading],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
