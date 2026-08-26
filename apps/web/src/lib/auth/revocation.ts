import { CacheKey, TTL, cacheGetMany, cacheSet, cacheDel } from "@/lib/cache";
import { withTimeout } from "@/lib/with-timeout";

/**
 * The parts of a verified token revocation needs. Narrower than `VerifiedToken`
 * so the mobile stack (which passes the same three fields through an injected
 * boundary) can call this without depending on the web verifier's types.
 */
export interface RevocableToken {
  userId: string;
  sessionId: string | null;
  issuedAtMs: number | null;
}

/**
 * Server-side session revocation.
 *
 * Local JWT verification (lib/auth/verify-token.ts) answers "is this token
 * genuine?" but not "is this session still allowed?" — a signed token stays
 * valid until it expires, so without this a signed-out or disabled user would
 * keep API access for up to the token's remaining lifetime. This module is the
 * other half; every authenticated entry point must consult it.
 *
 * Two markers, because they answer different questions:
 *
 *   revokedSession(sessionId)  one device — sign-out, "revoke this device"
 *   revokedAfter(userId)       every device — account disabled, membership
 *                              removed, role changed
 *
 * A per-user watermark rather than a list, so revoking everything is one write
 * regardless of how many sessions the user has. Tokens issued before the
 * watermark are rejected; the user's next sign-in mints a later `iat` and
 * works normally, so the marker needs no cleanup beyond its TTL.
 */

/**
 * Per-isolate memo of the revocation answer, keyed by session id.
 *
 * A single page load fans out six or more authenticated requests at once, and
 * without this each one would pay its own Redis round trip to learn the same
 * thing. The window is deliberately short: it is the longest a revoked session
 * can keep working, and 5s is well inside the time it takes a user to act on
 * having been signed out elsewhere.
 */
const MEMO_TTL_MS = 5_000;
const memo = new Map<string, { revoked: boolean; expiresAt: number; userId: string }>();

/**
 * How long a request will wait on Redis before giving up and treating the
 * session as live.
 *
 * Redis is normally single-digit milliseconds away, but it is a network hop,
 * and it is one this check sits directly in front of. Without a bound, a slow
 * or unreachable Upstash turns every authenticated request into a multi-second
 * stall — measured at over two seconds against a distant region — for an
 * answer that is "not revoked" essentially every time.
 *
 * Timing out fails open, matching what `cacheGetMany` already does when Redis
 * is unreachable, so the degradation is a revocation that lands late rather
 * than a product that stops responding.
 *
 * A timed-out answer is memoized like any other, so a persistently slow Redis
 * costs this budget once per memo window rather than once per request.
 */
const REVOCATION_LOOKUP_TIMEOUT_MS = 250;

/** Test seam: clears the in-process memo between cases. */
export function resetRevocationMemo(): void {
  memo.clear();
}

function memoKey(token: RevocableToken): string {
  return token.sessionId ?? `user:${token.userId}`;
}

/**
 * True when the token's session has been revoked and the request must be
 * rejected.
 *
 * Fails OPEN. `cacheGetMany` already returns nulls when Redis is unreachable,
 * and treating that as "revoked" would sign out every user in the product on
 * an Upstash outage. The exposure is bounded — revocation is a freshness
 * guarantee layered on top of expiry, not the only thing standing between a
 * token and the data, since RLS and the per-request membership check still
 * apply.
 */
export async function isSessionRevoked(token: RevocableToken): Promise<boolean> {
  const key = memoKey(token);
  const cached = memo.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.revoked;

  const keys = [CacheKey.revokedAfter(token.userId)];
  if (token.sessionId) keys.push(CacheKey.revokedSession(token.sessionId));

  const [revokedAfter, revokedSession] = await withTimeout(
    cacheGetMany<number | string>(keys),
    REVOCATION_LOOKUP_TIMEOUT_MS,
    keys.map(() => null),
  );

  let revoked = false;
  if (token.sessionId && revokedSession != null) {
    revoked = true;
  } else if (revokedAfter != null && token.issuedAtMs != null) {
    const watermark = typeof revokedAfter === "string" ? Number(revokedAfter) : revokedAfter;
    // Second granularity in `iat` means a token minted in the same second as
    // the revocation could read as "issued at or after" it. Compare with <=
    // so that tie resolves against the token.
    if (Number.isFinite(watermark) && token.issuedAtMs <= watermark) revoked = true;
  }

  memo.set(key, { revoked, expiresAt: now + MEMO_TTL_MS, userId: token.userId });
  return revoked;
}

/**
 * Drops this isolate's memoized answers for a user, so a revocation issued by
 * the same isolate takes effect immediately rather than after the memo window.
 *
 * Entries are keyed by session id, so finding a user's entries means scanning.
 * The map only ever holds sessions this isolate has served in the last few
 * seconds, so it stays small.
 *
 * Other isolates keep their own memo — the real upper bound on how long a
 * revoked session can still be accepted anywhere is MEMO_TTL_MS.
 */
function forgetMemoizedUser(userId: string): void {
  for (const [key, entry] of memo) {
    if (entry.userId === userId) memo.delete(key);
  }
}

/**
 * Revokes one session — sign-out, or "revoke this device".
 *
 * Call with the Supabase `session_id` (the JWT's `session_id` claim), which is
 * what tokens carry and therefore what the read path can match on.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  memo.delete(sessionId);
  await cacheSet(CacheKey.revokedSession(sessionId), Date.now(), TTL.ACCESS_TOKEN);
}

/**
 * Revokes every session this user currently holds.
 *
 * For changes where letting an existing token keep working would be a real
 * access-control failure: account deactivated, membership removed or archived,
 * org role changed, account deleted. Not needed for ordinary profile edits.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  forgetMemoizedUser(userId);
  await cacheSet(CacheKey.revokedAfter(userId), Date.now(), TTL.ACCESS_TOKEN);
}

/**
 * Clears a user's revoke-all watermark.
 *
 * Only for undoing a revocation whose cause was itself undone (an account
 * reactivated within the token lifetime). Sign-in does not need this: a fresh
 * token's `iat` is already past the watermark.
 */
export async function clearUserRevocation(userId: string): Promise<void> {
  forgetMemoizedUser(userId);
  await cacheDel(CacheKey.revokedAfter(userId));
}
