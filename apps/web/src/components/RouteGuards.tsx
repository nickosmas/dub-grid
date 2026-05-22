"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect } from "react";
import AuthSplash from "@/components/AuthSplash";
import { isAuthTransitionPending, consumeAuthTransition } from "@/lib/auth-transition";

/**
 * Wraps public (unauthenticated) routes such as /login.
 * Renders children as-is; does NOT redirect authenticated users because
 * the login flow needs the form visible while verifying JWT claims post-sign-in.
 */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Wraps protected routes (e.g. /schedule).
 * Shows nothing while auth is loading, redirects to /login if unauthenticated,
 * and only renders children once a valid session is confirmed client-side.
 * This prevents flash-of-content when stale session cookies bypass the middleware.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      // Arrived authenticated — the login navigation settled, so the splash
      // can stop bridging the gap.
      consumeAuthTransition();
      return;
    }
    // Not authenticated. During a login navigation the session is still
    // settling — hold the splash briefly instead of bouncing, with a guard so
    // a session that never materializes can't get stuck. Otherwise (e.g.
    // sign-out) redirect to the sign-in page immediately.
    if (isAuthTransitionPending()) {
      const t = setTimeout(() => {
        consumeAuthTransition();
        window.location.replace("/login");
      }, 6000);
      return () => clearTimeout(t);
    }
    window.location.replace("/login");
  }, [isLoading, user]);

  // Bridge a login navigation with the branded splash; otherwise render nothing
  // (a sign-out redirects to /login instantly — no logo flash).
  if (isLoading || !user) {
    return isAuthTransitionPending() ? <AuthSplash /> : null;
  }

  return <>{children}</>;
}
