"use client";

/**
 * Tracks an in-progress local sign-out. During logout we clear the React Query
 * cache and tear down the Supabase session while the app is still mounted, so
 * active queries (e.g. the org bootstrap) refetch against a dying session and
 * fail with 401/expired. handleApiError would then flash a "session expired" /
 * generic error toast right before the redirect. This flag lets the error
 * handler stay silent once logout has started.
 *
 * Module-level (not sessionStorage): it only needs to live until the redirect
 * unloads the page, and must be readable synchronously without a splash signal
 * (logout is deliberately splash-free).
 */
let loggingOut = false;

export function beginLogout(): void {
  loggingOut = true;
}

export function isLoggingOut(): boolean {
  return loggingOut;
}
