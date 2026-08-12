/**
 * The `sub` claim of a Supabase access token, i.e. the signed-in user's id.
 *
 * Used for cache keys that must stay put while the token itself does not.
 * Supabase runs with `autoRefreshToken`, so the token string rotates on its own
 * every session lifetime and on some foregrounds; `sub` does not change until a
 * different account signs in.
 *
 * Signature verification is the server's job. This only reads a claim to key a
 * local cache with, so a forged token would gain nothing here: every request it
 * keys is still authorized server-side.
 */
export function getUserIdFromAccessToken(accessToken: string | null): string | null {
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
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };

    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    // A token we can't read still gets a usable (shared) cache key: sign-out
    // clears the whole query cache, so nothing of the previous account survives
    // to be read through it.
    return null;
  }
}
