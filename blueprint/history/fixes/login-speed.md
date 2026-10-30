# Current Feature

## Sign-in and page loads stop waiting on repeated auth checks

**Type:** Fix
**Status:** verified
**Branch:** `fix/login-speed` (worktree `.claude/worktrees/login-speed`; another session's spec holds the shared checkout's copy of this file)
**Fixes:** F-132, F-131, F-129 (F-130 proved invalid in step 0)

## The problem

Production Speed Insights (US desktop, p75, Oct 23-29): TTFB 2.53s, FCP 3.29s,
LCP 3.67s, Real Experience Score 71; `/login` 73, `/schedule` 74,
`/people/[id]` 74. Most of LCP passes before the first byte, and the first
byte is only a splash. A hard load of a signed-in page runs these waits one
after another:

1. `src/proxy.ts`, at the edge PoP: `getSession()` (a token refresh when
   it's within 90s of expiry), a remote JWKS fetch on a fresh isolate, then
   org access as Redis and then PostgREST. Verification finishes before the
   org reads start.
2. `(app)/layout.tsx`: `hasVerifiedSession()` repeats `getSession()`. When
   the proxy refreshed, it refreshes again, because the proxy's `setAll` writes
   only the response cookies (F-130).
3. The browser downloads 450-620 KB gzip of JS. `ProtectedRoute` shows
   `BrandLoadingScreen` until `AuthProvider` has run `getSession()` and
   then `getUser()`, a Supabase Auth round trip. Only then do the page's
   queries start (F-131).

`/login`, `/forgot-password`, `/reset-password`, `/accept-invite` and
`/auth/*` sit under `(app)`. They load the signed-in shell (AppShell, Header,
the onboarding and two-factor gates, tooltips, `app-ui.css`), which puts
`/login` at about 470 KB gzip of first-load JS. PageSpeed desktop scores it 76,
with 460ms TBT and 221 KiB of unused JS (F-132).

## The fix

Four changes, measured before and after. They don't change who can see what.

- **Refresh once (F-130).** Step 0 showed the render already sees the proxy's
  refreshed cookie, so no change is needed here.
- **A light layout for signing in (F-132).** No file moves. `(app)/layout.tsx`
  keeps what sign-in and the app share (AuthProvider, PostHog, QueryProvider,
  SignInPrefetch and `app-ui.css`, whose `dg-auth-*`, card, modal and input
  classes the sign-in pages use) and wraps pages in `AppChrome`. On the
  sign-in routes (`isSignInRoute`) it renders the page bare; elsewhere it
  renders `AppShellProviders` (the gates, TooltipProvider, NavigationGuard and
  AppShell) through `next/dynamic`, which a sign-in page never downloads and
  an app page gets preloaded with its HTML. Moving the signed-in pages into a
  nested group instead would have touched about 30 files and the docs
  inventory for the same result. Sign-in still soft-navigates to `/dashboard`
  inside the same AuthProvider and QueryClient, so SignInPrefetch's primed
  queries survive.
- **Paint without re-asking (F-131).** The layout already verifies the token.
  It passes the verified user id to `AuthProvider`. When the session read from
  cookies has that user and an unexpired token, `AuthProvider` commits it at
  once and runs `getUser()` in the background. A failed or mismatched check
  signs out exactly as today. Server data is still authorized per request, so
  a revoked session can at most show the shell for one round trip.
- **Check once, near the data (F-129).**
  - The proxy verifies with the public keys `next.config.ts` fetched at build
    time, asking Supabase only for a key added since. Only the proxy: a key
    revoked after a build stays trusted there until the next deploy, so route
    handlers and the layout keep the live keyset, and the rotation runbook says
    to redeploy after revoking a key.
  - The org reads go from the per-isolate memo straight to the database. The
    Redis layer in between rarely hit (30s entries, low traffic), so a miss
    cost a Redis GET and then the query in series. Its writers and
    invalidations go too.
  - Not done, on the step 0 evidence: starting the org reads during
    verification (local verification takes 1-2ms, so there is nothing left to
    overlap), and pinning the proxy to `pdx1` (it would save one round trip on
    a memo miss for East Coast users but add a cross-country hop to the static
    public pages, which score 99).

Must not break:

- Suspended, offboarded, billing-locked, archived-org and stale-Gridmaster
  handling, which the proxy redirects.
- Per-session org isolation.
- Revocation.
- The post-login soft navigation and the org-switch hard navigation.
- The nonce CSP.
- Recovery and invitation flows.

## Build steps

- [x] **0. Measure the baseline.**
  - Add Server-Timing spans for each proxy wait that has none (`mw_session`,
    the org reads, the sandbox check) and for the layout's
    `hasVerifiedSession` and flag reads.
  - Record a table in this spec:
    - the field numbers above;
    - PageSpeed `/login` (desktop 76, TBT 460ms; mobile 91);
    - the production network waterfall from the browser pane for: a cold
      `/login`, sign-in through to the dashboard, and a hard reload of
      `/schedule` after more than 5 minutes idle (redirects, TTFB, the time
      to the first real content, and the requests in series before it);
    - the local dev span list for a hard load, which gives the structure
      rather than absolute times.
  - **Done when:** the table is filled in and the spans appear in
    `Server-Timing` with `PERF_TIMING=1` locally.

  **Baseline (2026-10-30).** Production field numbers are above. Lab and local:

  | Measure                                   | Value                                                                        |
  | ----------------------------------------- | ---------------------------------------------------------------------------- |
  | PageSpeed `/login` desktop                | 76; FCP 0.3s, LCP 1.4s, TBT 460ms, 221 KiB unused JS                         |
  | PageSpeed `/login` mobile                 | 91; FCP and LCP 2.7s, 1.33s LCP render delay from 43 KiB render-blocking CSS |
  | Production `/login` from SF, browser pane | 36 scripts, 566 KB transferred, FCP 1.16s                                    |
  | Production `/dashboard` signed out        | one 307 to `/login` (304ms), then a 315ms TTFB                               |
  | Local proxy, warm (memos live)            | `mw_total` 1.4-1.6ms                                                         |
  | Local proxy, memo expired (10s idle)      | `mw_org_access` 106ms; `mw_total` 114ms                                      |
  | Local proxy, cold process                 | `jwt_verify` 35ms, `mw_org_access` 472ms; `mw_total` 512ms                   |
  | Local proxy, token near expiry            | `mw_session` 182-358ms (the refresh); `mw_total` 486-538ms                   |
  | Local `(app)` layout, per hard load       | `layout_session` 23-104ms, `layout_posthog_flag` 6-28ms (cold 191 / 215ms)   |
  | Production first-load JS (gzip, build)    | `/login` ~470 KB; `/dashboard` ~463 KB; `/schedule` ~612 KB                  |

  A signed-in production waterfall is not recorded yet: the browser pane has no
  production session. Speed Insights over the week after release is the
  comparison that counts.

- [x] **1. Refresh once (F-130): not needed.** Measured instead of built.
      A near-expiry hard load rotated the refresh token once (1 to 2 rows in
      `auth.refresh_tokens`), and the layout's session read took 40ms against the
      proxy's 182-358ms refresh. Next 16 hands cookies the proxy sets to the render
      (`x-middleware-set-cookie`, merged in `server/async-storage/request-store.js`),
      so the render already sees the refreshed token. F-130 is invalid. The
      layout's remaining cost (its own `getSession` and JWT verify, 23-104ms) moves
      to step 3.

- [x] **2. Sign-in pages leave the app shell (F-132).**
  - `components/AppChrome.tsx`, `components/AppShellProviders.tsx`,
    `isSignInRoute` in `components/onboarding/public-routes.ts` (tested), and
    the layout renders `AppChrome`. Docs: `apps/web/AGENTS.md`,
    `internal/architecture/folder-structure.md`.
  - **Done when:** met. Route tests pass (19). In the browser, `/login`,
    `/forgot-password` and `/accept-invite` render without the shell, and
    signing in soft-navigates to the dashboard with its header and data.
    First-load JS, production build, gzip, `dev` against this branch:
    `/login` 467 to 413 KB, `/accept-invite` 467 to 381 KB,
    `/forgot-password` 461 to 371 KB. Signed-in pages still load the shell,
    now as a preloaded dynamic chunk, so their lower build figures are not a
    saving. E2E journeys run in CI on the pull request.

- [x] **3. Paint without re-asking (F-131).**
  - The layout's `verifiedSessionUserId()` returns the id its existing check
    verified, and `AuthProvider` takes it as `serverVerifiedUserId` (read once,
    through a ref). A proxy header was not worth it: the layout's own verify is
    a millisecond once keys are local.
  - `serverVouchedUser` and the fast path, keeping the painted user when the
    background check confirms the same person.
  - **Done when:** met. `AuthProvider.test.tsx` (8) covers match, mismatch,
    expiry, no server id, and a failed background check signing out. In the
    browser, a hard load of `/schedule` started permissions, org context and
    bootstrap at 10.93s, before `getUser` (11.01 to 11.52s; dev compile times).

- [x] **4. Check once, near the data (F-129).**
  - `getProxyJwks` in `lib/auth/verify-token.ts`, `getShippedSupabaseJwks` in
    `lib/supabase-keys.ts`, `withSupabaseJwks` in `next.config.ts`, and
    `SUPABASE_JWKS` classified as build-injected in the docs source policy.
  - `readMemoized` without Redis; `mwOrgAccess` and `mwOrgVisible` removed
    from `CacheKey` with their writers in the access-status, Stripe,
    Gridmaster manage, organization access and offboarding paths.
  - Docs: `internal/authentication.md`, `internal/secrets-rotation.md`,
    `ARCHITECTURE.md`; six public pages' evidence fingerprints re-recorded
    (their text is unaffected).
  - **Done when:** met. `proxy-jwks.test.ts` (4) covers shipped keys with no
    fetch, a rotated key falling back, a forged token refused, and no shipped
    keys. Middleware and affected route suites pass. Local Server-Timing on a
    fresh process: `jwt_verify` 1.2ms (was 35ms), `mw_org_access` 128ms (was
    472ms). After the memo lapses: 74-99ms (was 106ms), even locally,
    where both the old Redis entry and the database answered fast; the
    production gain is the Redis miss that used to add a second serial round
    trip from the edge. Full `test:web`: 7084 passed; two integration tests
    that share the local database failed in the full run and pass alone.

## Verify

- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`, and
  `npm run test:e2e` for the sign-in, recovery and invitation journeys.
- Browser: sign in, use the recovery and invitation flows, switch orgs, and
  check that a suspended or billing-locked org still redirects.
- After release, compare the step 0 table on production, and Speed Insights
  over the following week. The target is a hard-load TTFB under about 600ms
  and the dashboard in about 1s after sign-in; both are estimates to confirm.

## Out of scope

- Server-rendering the first screen's data (a follow-up once step 3 lands).
- Dropping the nonce CSP or `force-dynamic` (F-133).
- Schedule INP, mobile, database and cron findings (F-134 to F-153).

## Findings

### login-speed/F-130 [P2] invalid - An expiring session is refreshed twice per hard load

**File:** `apps/web/src/proxy.ts:340-353`; `apps/web/src/app/(app)/layout.tsx:59-74`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `getSession()` refreshes a token within 90s of expiry, which covers any visit after an hour idle. The proxy's `setAll` writes only `res.cookies`, and the request was already forwarded with its old cookies. So `hasVerifiedSession()` in the layout refreshes a second time and throws the result away. That is two Supabase Auth refreshes, each running the access-token hook, before the shell streams. Neither is timed.
**Suggested fix:** Use @supabase/ssr's middleware pattern: in `setAll`, also set `req.cookies` and rebuild `NextResponse.next({ request })`. Better, have the proxy pass a verified-session header that the layout trusts (incoming `x-dubgrid-*` headers are already stripped).
**Resolution:** Invalid, shown by measurement on fix/login-speed (2026-10-30). Next 16 merges cookies the proxy sets into the render's `cookies()` (`x-middleware-set-cookie`, `next/dist/server/async-storage/request-store.js`), so the layout reads the refreshed token. A near-expiry local hard load rotated the refresh token once, and the layout's session read took 40ms against the proxy's 182-358ms refresh. The layout's own session read and verify still cost 23-104ms per hard load; F-131's fix removes it.
