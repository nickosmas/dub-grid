"use client";

import { useSyncExternalStore } from "react";

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

// Same-tab sessionStorage writes don't fire the "storage" event, so we notify
// useSyncExternalStore subscribers ourselves whenever the flag flips.
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function markAuthTransition(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // sessionStorage unavailable — splash simply won't pre-paint; harmless.
  }
  emit();
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
  emit();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * SSR-safe read of the auth-transition flag for use in render paths.
 *
 * Returns `false` on the server and during the hydration render so the markup
 * matches, then settles to the live sessionStorage value on the client. On a
 * fresh client mount (soft nav) it reads the live value immediately, so the
 * post-login splash still paints without a flash. Reading the flag directly via
 * isAuthTransitionPending() during render causes a hydration mismatch — use
 * that imperative form only inside effects and event handlers.
 */
export function useAuthTransitionPending(): boolean {
  return useSyncExternalStore(subscribe, isAuthTransitionPending, () => false);
}
