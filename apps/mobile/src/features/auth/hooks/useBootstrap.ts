import { useQuery } from "@tanstack/react-query";
import { getUserIdFromAccessToken } from "../../../shared/lib/access-token";
import { getBootstrap } from "../../../shared/lib/api";

/**
 * Every bootstrap cache entry lives under this prefix, so invalidators can
 * match on it without knowing whose entry they are matching.
 */
export const BOOTSTRAP_QUERY_KEY_PREFIX = ["mobile", "bootstrap"] as const;

export function useBootstrap(accessToken: string | null) {
  // Keyed by the user the token belongs to, NOT by the token string. Supabase
  // runs with `autoRefreshToken`, so that string rotates on its own every
  // session lifetime and on some foregrounds. With it in the key, each rotation
  // pointed the query at a brand-new empty cache entry, which put `useTabsGate`
  // back into `isLoading` and threw the launch splash over a running app.
  //
  // The user id still gives the isolation the token was there for: signing in
  // as someone else cannot read the previous account's org, permissions or
  // linked employee out of the cache.
  const userId = getUserIdFromAccessToken(accessToken);

  return useQuery({
    queryKey: [...BOOTSTRAP_QUERY_KEY_PREFIX, userId],
    queryFn: () => getBootstrap(accessToken!),
    enabled: Boolean(accessToken),
  });
}
