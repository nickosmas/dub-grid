"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect, useRef } from "react";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
import {
  isAuthTransitionPending,
  useAuthTransitionPending,
  consumeAuthTransition,
} from "@/lib/auth-transition";

/** How long a sign-in may wait for its session before it goes back to /login. */
export const SIGN_IN_SETTLE_DEADLINE_MS = 6000;

/**
 * Sends a sign-in whose session never arrives back to /login once
 * SIGN_IN_SETTLE_DEADLINE_MS has passed since `waiting` first became true.
 * For surfaces that hold the sign-in splash before ProtectedRoute mounts.
 */
export function useSignInSettleDeadline(waiting: boolean): void {
  const deadlineRef = useRef<number | null>(null);
  useEffect(() => {
    if (!waiting) {
      deadlineRef.current = null;
      return;
    }
    deadlineRef.current ??= Date.now() + SIGN_IN_SETTLE_DEADLINE_MS;
    const t = setTimeout(
      () => {
        consumeAuthTransition();
        window.location.replace("/login");
      },
      Math.max(0, deadlineRef.current - Date.now()),
    );
    return () => clearTimeout(t);
  }, [waiting]);
}

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
  const authTransitionPending = useAuthTransitionPending();
  // Wall-clock deadline for the "session never materialized" bounce (L-5).
  // Stored in a ref so auth state flapping ([isLoading,user]) during the settle
  // doesn't keep resetting the timeout past the intended 6s hard cap.
  const bounceDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      // Arrived authenticated — the login navigation settled, so the splash
      // can stop bridging the gap.
      consumeAuthTransition();
      bounceDeadlineRef.current = null;
      return;
    }
    // Not authenticated. During a login navigation the session is still
    // settling — hold the splash briefly instead of bouncing, with a guard so
    // a session that never materializes can't get stuck. Otherwise (e.g.
    // sign-out) redirect to the sign-in page immediately.
    if (isAuthTransitionPending()) {
      if (bounceDeadlineRef.current === null) {
        bounceDeadlineRef.current = Date.now() + SIGN_IN_SETTLE_DEADLINE_MS;
      }
      const remaining = Math.max(0, bounceDeadlineRef.current - Date.now());
      const t = setTimeout(() => {
        consumeAuthTransition();
        window.location.replace("/login");
      }, remaining);
      return () => clearTimeout(t);
    }
    window.location.replace("/login");
  }, [isLoading, user]);

  // A post-login session handoff is a real wait, not decorative chrome. Give
  // the user progress text and, after 30 seconds, a safe exit rather than an
  // unlabeled blank frame.
  if (isLoading || !user) {
    return authTransitionPending ? <AuthTransitionScreen phase="signing-in" /> : null;
  }

  return <>{children}</>;
}
