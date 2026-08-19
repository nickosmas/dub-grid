/**
 * Reads one string claim out of a Supabase access token.
 *
 * Signature verification is the server's job. These claims only key a local
 * cache, so a forged token would gain nothing here: every request the cache
 * keys is still authorized server-side.
 */
function readStringClaim(accessToken: string | null, claim: string): string | null {
  if (!accessToken) {
    return null;
  }

  const payload = accessToken.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    // base64url -> base64, then pad to a multiple of 4.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>;
    const value = claims[claim];

    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    // A token we can't read still gets a usable (shared) cache key: sign-out
    // clears the whole query cache, so nothing of the previous account survives
    // to be read through it.
    return null;
  }
}

/**
 * The `sub` claim of a Supabase access token, i.e. the signed-in user's id.
 *
 * Used for cache keys that must stay put while the token itself does not.
 * Supabase runs with `autoRefreshToken`, so the token string rotates on its own
 * every session lifetime and on some foregrounds; `sub` does not change until a
 * different account signs in.
 */
export function getUserIdFromAccessToken(accessToken: string | null): string | null {
  return readStringClaim(accessToken, "sub");
}

/**
 * The `org_id` claim, i.e. the organization THIS token is scoped to.
 *
 * The companion to `sub` for any cache key that outlives a token rotation. `sub`
 * alone is not enough: one user can be in several organizations, so a key built
 * from `sub` is byte-identical either side of an org switch, and whatever the
 * old org wrote is what the new org reads. Pairing the two makes an entry
 * unreachable from any org but the one that filled it, without depending on the
 * switch's teardown winning a race against an in-flight refetch.
 *
 * Null for a token with no org (a gridmaster, or a user whose membership the
 * access-token hook refused) — a legitimate, distinct cache identity of its own.
 */
export function getOrgIdFromAccessToken(accessToken: string | null): string | null {
  return readStringClaim(accessToken, "org_id");
}
