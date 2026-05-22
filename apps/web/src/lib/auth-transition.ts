"use client";

/**
 * Tracks an in-flight auth navigation (login success / logout) across the hard
 * `window.location.replace` that re-runs middleware with fresh JWT cookies.
 *
 * The flag lets the destination paint the branded <AuthSplash> instantly
 * instead of a blank/white frame while the client re-verifies the session, and
 * lets ProtectedRoute defer its own redirect so it doesn't race the redirect
 * that signOutLocal already owns.
 *
 * Backed by sessionStorage so it survives a same-origin hard navigation
 * (login -> /dashboard on the same subdomain). It is best-effort: any failure
 * (private mode, SSR) degrades gracefully to "no transition pending".
 */
const KEY = "dg_auth_transition";

export function markAuthTransition(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // sessionStorage unavailable — splash simply won't pre-paint; harmless.
  }
}

export function isAuthTransitionPending(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeAuthTransition(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
