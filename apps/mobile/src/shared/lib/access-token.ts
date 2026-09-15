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

export type MobileAuthIdentity =
  | { kind: "anonymous"; userId: null; orgId: null }
  | { kind: "unreadable"; userId: null; orgId: null }
  | { kind: "authenticated"; userId: string; orgId: string | null };

export type MobileAuthIdentityKey = readonly [
  kind: MobileAuthIdentity["kind"],
  userId: string | null,
  orgId: string | null,
];

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

/**
 * Stable client identity for session transitions and authenticated cache keys.
 *
 * The token string is deliberately absent: Supabase rotates it during a live
 * session, while `sub` and `org_id` stay fixed until the account or active
 * organization actually changes. Decoded claims never grant access; the
 * server still verifies every token and enforces its organization boundary.
 */
export function getMobileAuthIdentity(accessToken: string | null): MobileAuthIdentity {
  if (!accessToken) {
    return { kind: "anonymous", userId: null, orgId: null };
  }

  const userId = getUserIdFromAccessToken(accessToken);
  if (!userId) {
    return { kind: "unreadable", userId: null, orgId: null };
  }

  return {
    kind: "authenticated",
    userId,
    orgId: getOrgIdFromAccessToken(accessToken),
  };
}

export function getMobileAuthIdentityKey(accessToken: string | null): MobileAuthIdentityKey {
  const identity = getMobileAuthIdentity(accessToken);
  return [identity.kind, identity.userId, identity.orgId];
}

export function isSameMobileAuthIdentity(
  left: MobileAuthIdentity,
  right: MobileAuthIdentity,
): boolean {
  return left.kind === right.kind && left.userId === right.userId && left.orgId === right.orgId;
}
