"use client";

import { useAuth } from "@/components/AuthProvider";
import { useEffect, useRef, useState } from "react";
import { STARTUP_MIN_SPLASH_MS } from "@dubgrid/design-tokens";
import AuthTransitionScreen from "@/components/AuthTransitionScreen";
import {
  isAuthTransitionPending,
  useAuthTransitionPending,
  consumeAuthTransition,
} from "@/lib/auth-transition";

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
  // A session that restores in a couple of frames should go straight to the
  // app. Past the flicker threshold the wait is real, and a blank frame is the
  // one thing a startup surface exists to prevent.
  const [restoreIsVisible, setRestoreIsVisible] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setRestoreIsVisible(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRestoreIsVisible(true);
    }, STARTUP_MIN_SPLASH_MS);

    return () => window.clearTimeout(timeout);
  }, [isLoading]);
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
        bounceDeadlineRef.current = Date.now() + 6000;
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

  // A session handoff is a real wait, not decorative chrome. Give the user the
  // brand mark, a progress indicator and, once the wait is long enough, an
  // explanation and a safe exit rather than an unlabeled blank frame.
  //
  // Restoring a session is the ordinary cold load and used to render `null`,
  // so the web app opened on nothing at all while it worked. A redirect to
  // /login keeps rendering nothing: it is about to leave, and "Loading your
  // workspace" would be a claim about a session this branch just established
  // does not exist.
  if (isLoading || !user) {
    if (authTransitionPending) {
      return <AuthTransitionScreen phase="signing-in" />;
    }
    return isLoading && restoreIsVisible ? <AuthTransitionScreen phase="workspace" /> : null;
  }

  return <>{children}</>;
}
