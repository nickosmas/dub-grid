import { useQuery } from "@tanstack/react-query";
import {
  getOrgIdFromAccessToken,
  getUserIdFromAccessToken,
} from "../../../shared/lib/access-token";
import { getBootstrap } from "../../../shared/lib/api";
import { isNetworkConnectionError } from "../../../shared/lib/errors";

/**
 * Every bootstrap cache entry lives under this prefix, so invalidators can
 * match on it without knowing whose entry they are matching.
 */
export const BOOTSTRAP_QUERY_KEY_PREFIX = ["mobile", "bootstrap"] as const;

/**
 * The cache identity of one bootstrap payload: who the token is for, and which
 * organization it is scoped to.
 *
 * Keyed by the claims, NOT by the token string. Supabase runs with
 * `autoRefreshToken`, so that string rotates on its own every session lifetime
 * and on some foregrounds. With it in the key, each rotation pointed the query
 * at a brand-new empty cache entry, which put `useTabsGate` back into
 * `isLoading` and threw the launch splash over a running app.
 *
 * Both claims are needed, and the org one is a tenancy boundary, not a nicety.
 * Bootstrap carries `currentOrg`, `permissions`, `memberships`, `linkedEmployee`,
 * the org's labels and its feature flags. `sub` is invariant across an org
 * switch, so a user-only key is byte-identical either side of one: the switch
 * clears the cache, but observers mounted above the router (the realtime
 * provider, the terms gate, the tabs gate) refetch the instant it is cleared,
 * using whatever token their last render captured — the OLD one, if the new
 * session has not yet propagated through `AuthSessionProvider`. That response
 * landed on the exact key the new org then read, and `staleTime` served it as
 * fresh. With the org in the key it lands somewhere the new org never looks.
 */
export function buildBootstrapQueryKey(accessToken: string | null) {
  return [
    ...BOOTSTRAP_QUERY_KEY_PREFIX,
    getUserIdFromAccessToken(accessToken),
    getOrgIdFromAccessToken(accessToken),
  ] as const;
}

export function useBootstrap(accessToken: string | null) {
  return useQuery({
    queryKey: buildBootstrapQueryKey(accessToken),
    // Consume React Query's cancellation signal so a switch/logout cannot let
    // an in-flight bootstrap request complete into a stale cache entry.
    queryFn: (context) =>
      context?.signal ? getBootstrap(accessToken!, context.signal) : getBootstrap(accessToken!),
    enabled: Boolean(accessToken),
    retry: (failureCount, error) =>
      failureCount < 3 && (isNetworkConnectionError(error) || isRetryableBootstrapStatus(error)),
    retryDelay: (failureCount) => {
      const capped = Math.min(1_000 * 2 ** failureCount, 30_000);
      return Math.round(capped * (0.5 + Math.random() * 0.5));
    },
  });
}

function isRetryableBootstrapStatus(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : null;
  return status === 408 || status === 429 || (typeof status === "number" && status >= 500);
}
