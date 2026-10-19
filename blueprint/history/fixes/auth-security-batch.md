# Auth security fixes from the 2026-10-18 speed audit

**Type:** Fix
**Status:** verified

## The problem

A read-only audit of every sign-in and session flow (web and mobile, 2026-10-18)
found four security gaps on the auth path. Each was confirmed in the code.

1. **Password recovery reveals whether an account exists.**
   `features/account/server/recovery-request.ts` waits for Supabase Auth's
   `resetPasswordForEmail` before answering, and passes its 429 and 503
   through. Auth returns at once for an unknown email but sends mail for a real
   one, and only real accounts hit its per-user send interval or an SMTP
   failure. So response time, a 429 inside the interval, and a 503 each tell an
   attacker the address has an account. Web and mobile share this handler.
2. **Revocation marker writes fail silently.** `revokeSession` and
   `revokeAllUserSessions` (`lib/auth/revocation.ts`) write their markers with
   `cacheSet`, which swallows errors and timeouts. "Sign out other devices",
   "sign out everywhere" and the recovery sign-out then report success with no
   marker written. API routes verify tokens locally, so a copied access token
   keeps working for up to an hour, the exact gap the markers exist to close.
   `revokeBulkSessions` documents "partial failure is not success", and this
   breaks it.
3. **The proxy's token check is looser than the API's, and it leaks role
   headers.** `proxy.ts` calls `jwtVerify` with no issuer or audience, unlike
   `verifyAccessToken`. It also sets `x-dubgrid-role`, `-org-id`, `-org-slug`,
   `-impersonating` and `-sandbox` on the response the browser receives. No
   server code reads them (only tests), so they only disclose role, organization
   and impersonation state. Incoming `x-dubgrid-*` request headers are forwarded
   untouched, so future server code could trust a spoofed one.
4. **A refused mobile sign-in leaves a live session.** `loginMobileUser` signs
   in, then refuses a Gridmaster, a non-member or a locked organization. The
   route's catch never ends that session (the web login route does, through
   `refuseSignIn`), so a Supabase session and its `user_sessions` row stay
   alive with tokens nobody holds. Same pattern as F-78.

## The fix

1. After the rate limiters pass, the recovery request always answers 200 with
   the same body, and the send runs in `after()`. The audit event records the
   real outcome (accepted, throttled, failed) from inside `after()`. Our own
   limiters' 429 and the misconfigured 503 stay: they are decided before any
   account lookup, so they reveal nothing.
2. A new `cacheSetOrThrow` in `lib/cache.ts` throws on a failed or timed-out
   write, and in production when Redis is not configured (the rate limiter
   already fails closed there). Outside production with no Redis it is a no-op,
   as today. `revokeSession` and `revokeAllUserSessions` use it. Every caller
   already either catches and reports (status change, account deletion, login
   email change, refused web sign-in, local sign-out) or maps a throw to the
   existing 503 (bulk sign-out). Member removal (`organizations/access`) already
   lets a session-row delete error fail the request; a marker failure now does
   the same.
3. `verify-token.ts` exports the issuer and audience it checks, and the proxy
   passes them to `jwtVerify`. The decode fallback for non-Gridmasters stays
   exactly as it is (a failed verify must never block login). The proxy drops
   the five response headers and strips any incoming `x-dubgrid-*` request
   header before forwarding.
4. The mobile login route's catch reads the session the ephemeral client holds
   (in memory) and ends it with the existing `discardSession`, then answers as
   before. Cleanup stays best effort and never changes the response.

Must not break: login rate limiting, the proxy's decode fallback for
non-Gridmasters (see `AGENTS.md` memory on `59424e7`), the bulk sign-out 503
contract, the F-78 deadline cleanup.

Out of scope (reported, not fixed here): the mobile "resend code" calling
Supabase Auth directly, the 1-hour recovery code expiry, and the proxy's
per-organization access cache answering a just-removed member.

## Build steps

- [x] **1. Recovery answers the same for every address.** Done when the route
      returns 200 with an identical body whether Auth succeeds, returns 429 or
      returns 5xx, the send runs in `after()`, and tests cover all three.
- [x] **2. Revocation writes fail loudly.** Done when a failed or timed-out
      marker write makes `revokeSession` and `revokeAllUserSessions` throw, the
      bulk sign-out answers 503 in that case, and tests cover it.
- [x] **3. Proxy checks issuer and audience and stops leaking headers.** Done
      when a token with the wrong issuer or audience falls back to the decode
      path (Gridmaster refused, others pass), no `x-dubgrid-*` header is on the
      response, an incoming one is not forwarded, and tests cover each.
- [x] **4. A refused mobile sign-in ends its session.** Done when a
      Gridmaster, non-member or locked-organization refusal ends the session it
      created and still answers with the same status and message, with tests.

## Verify

- `npm run type-check`, `npm run lint`, and the web tests for the touched
  files (`recovery-request`, `revocation`, `session-sign-out`, `middleware`,
  `rbac-properties`, `auth-login`), then `npm run test:web`.

## Evidence

- Web type-check (`tsc --noEmit`) and ESLint on every changed file: clean.
- Focused suites: recovery-request (8), cache (22), revocation (12),
  session-sign-out (10), middleware (54), rbac-properties (118), mobile
  auth-login (15), all passing.
- Full web suite from the worktree: 5,590 of 5,591 passed. The one failure,
  `draft-state-editor-only.integration.test.ts`, is a live-database test whose
  local `realtime.messages` has no partition for the day; it touches none of
  these files and fails the same way alone.
- Not exercised against a running app.
