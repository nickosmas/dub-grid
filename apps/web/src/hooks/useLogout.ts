// src/hooks/useLogout.ts
import { beginLogout } from "@/lib/logout-state";
import { signOutFromBrowser } from "@/features/account/client";
import { parseInternalDestination } from "@/lib/auth/integrity-contract";

export type SignOutScope = "local" | "global";

export interface SignOutOptions {
  /** "local" tears down this device only; "global" tears down all devices. */
  scope?: SignOutScope;
  /** Override the post-logout destination. Defaults to /goodbye. */
  redirectTo?: string;
  /** Explains the sign-out on /goodbye. */
  reason?: "password-changed" | "password-unconfirmed";
}

/**
 * Per-device logout helper.
 *
 * `signOut` is intentionally minimal: it sets the in-flight-logout flag (so
 * incidental query errors during the navigation stay silent) and hard-navigates
 * to `/goodbye?scope=...`. The destination page mounts `RunLogoutTeardown`,
 * which performs the actual session teardown (queryClient.clear, Supabase
 * signOut, realtime channel cleanup, dg_* wipe).
 *
 * Why the caller does NO teardown: doing it inline races every route guard,
 * AuthProvider re-render, and the Supabase auth lock that the previous page's
 * AuthProvider is still touching. Hard-navigating first tears down the entire
 * React tree, so the destination runs the teardown in a clean, public-route
 * environment with no contention.
 *
 * `signOutOthers` tears down OTHER devices only (the current device stays
 * signed in) — no navigation.
 */
export function useLogout() {
  function signOut({
    scope = "local",
    redirectTo = "/goodbye",
    reason,
  }: SignOutOptions = {}): void {
    beginLogout();
    const destination = parseInternalDestination(redirectTo, "/goodbye");
    const url = new URL(destination, window.location.origin);
    url.searchParams.set("scope", scope);
    if (reason) url.searchParams.set("reason", reason);
    window.location.replace(url.pathname + url.search + url.hash);
  }

  async function signOutOthers(): Promise<void> {
    await signOutFromBrowser("others");
  }

  return { signOut, signOutOthers };
}
