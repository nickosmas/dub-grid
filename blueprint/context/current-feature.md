# Fix: Sign-in and cold opening stop waiting in line

**Type:** Fix
**Status:** in progress
**Branch:** `fix/sign-in-cold-open-speed`
**Fixes:** F-154, F-155, F-156, F-157, F-158, F-165, F-181, F-182, F-183, F-184, F-185

## The problem

Signing in and opening the app cold are slow on web and mobile because work
that could overlap runs one step after another, and the phone remembers
nothing between launches. The second performance audit on 2026-10-30 recorded
each wait in `blueprint/context/findings.md`:

| ID    | Where                        | The wait                                                                                                             |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| F-154 | web sign-in                  | The app shell's code downloads only after the dashboard's server render returns                                      |
| F-155 | web sign-in                  | The splash waits on the browser's own `getUser`, though the route set the cookies                                    |
| F-156 | web hard load                | Three API waves: permissions and bootstrap, then the roster, then the dashboard                                      |
| F-165 | web, every page              | The header loads the whole roster for `employees.length > 0`                                                         |
| F-157 | web, every page and API call | Billing policy read Redis then database; in routes it runs after the database wave, then "setup complete" after that |
| F-158 | web routes and layout        | Tokens verified against the remote key set, fetched on each fresh instance                                           |
| F-184 | mobile, every API call       | Flag lookup before verification, 7 setup queries per call on a cold instance, no reuse across the startup burst      |
| F-185 | mobile startup handlers      | Independent database reads in series; hidden-people scan gates every fetcher                                         |
| F-182 | mobile sign-in               | Login response lacks the bootstrap, so the app asks again before Home can prefetch                                   |
| F-183 | mobile cold start            | Bootstrap waits for fonts, the theme read and the first render                                                       |
| F-181 | mobile cold start            | No persisted query cache: every open waits on a token refresh and bootstrap before anything shows                    |

Mobile today (signed in, expired token): JS boot, fonts, theme read, render,
token refresh, bootstrap, splash lifts, Home queries, content. Mobile sign-in:
login, then bootstrap, then Home prefetch, then navigate.

## The fix

Overlap what doesn't depend on each other, stop repeating reads within a
request or a startup burst, and let the phone show the last session's data
while it refreshes.

Must hold:

- **Security is unchanged.** Every route still verifies the token (now with the
  build-shipped keys and the same remote fallback for an unknown `kid`). A
  cookie session is trusted only where F-131 already trusts it: it matches the
  user the server verified and the token is unexpired. Revocation, deactivation,
  billing lock and setup checks run on every request as now; only their order
  changes. A memoized mobile auth context lives at most 5 seconds, is keyed by
  a hash of the token, and is never shared across tokens.
- **Billing decisions keep failing closed.** A policy read failure still falls
  back to the built-in defaults, uncached.
- **Old app builds keep working.** The login response's new bootstrap field is
  optional in `packages/contracts`; an app without it still calls `/bootstrap`.
- **The persisted mobile cache is the user's own and short-lived.** Only the
  bootstrap and Home keys, keyed by user, organization and app version, at most
  24 hours old, cleared on sign-out, organization switch, account deletion and
  an auth failure. Restored data is shown, then refreshed; it never decides
  access (the server still does).
- **No new migration.** Migration 113 is in flight on another branch. F-176's
  index on `profiles` waits; this fix memoizes the lookup instead.
- **Overlaps.** `fix/quiet-fast-sign-in` (worktree `quiet-sign-in`) changes
  `AuthTransitionScreen.tsx` and `SetupGuard.tsx`. Rebase onto it if it lands
  first; step 1 must not undo its quiet fast path.

## Build steps

- [x] **1. Web sign-in hand-off (F-154, F-155).**
  - `components/dashboard/preloadDashboardView.ts`: also
    `import("@/components/AppShellProviders")`.
  - `AuthProvider`: when the login route reports `sessionCookieSet`, commit
    the session it returned, with the user it signed in, as server-vouched,
    the way the F-131 hard-load path does; `setSession`'s `getUser` runs
    behind it. (Not the cookie session: reading it waits on the auth lock
    that `setSession` holds through its round trip.)
  - Tests: `AuthProvider.test.tsx` covers the vouched soft navigation and a
    failed background check still signing out.
    **Done when:** in the browser pane, a production-mode sign-in shows the
    `AppShellProviders` chunk requested during the login POST, and dashboard
    queries start before the browser's `/auth/v1/user` returns.

- [x] **2. Web hard load (F-156, F-165).**
  - `AppShell.tsx`: read the bootstrap's `activeEmployeeCount` for the setup
    lock (as `SetupGuard` does) instead of loading the roster.
  - `SignInPrefetch`: prime the sign-in queries once on a hard load too, from
    the server-vouched session, starting the roster from the token's `org_id`
    with the dashboard only, since the header no longer reads it.
  - Tests: the setup lock with zero and some employees; priming on a hard load.
    **Done when:** a cold hard load of `/dashboard` shows two API waves, not
    three, in the network panel, and no full roster request on pages that don't
    show one.

- [ ] **3. Server auth path (F-157, F-158).**
  - `lib/billing-policy.ts`: read the platform policy straight from the
    database with a 5-minute memo, no Redis; the proxy's missing-claims
    fallback likewise.
  - `app/api/shared/permissions.ts` (`requireOrgPermissions`): start the policy
    and "setup complete" reads in the same `Promise.all` as the membership,
    profile and organization reads; ignore setup for Gridmasters.
  - `lib/auth/verify-token.ts`: `verifyAccessToken` uses `getProxyJwks()`.
  - `(app)/layout.tsx`: move `layout_client_flags` into the `Promise.all`.
  - `next.config.ts`: fail the production build (not a silent fallback) when
    the JWKS can't be fetched, unless an explicit opt-out env is set for
    offline builds.
  - Tests: route-level tests for the parallel order and the fail-closed
    policy; `proxy-jwks.test.ts` extended to `verifyAccessToken`.
    **Done when:** `PERF_TIMING=1` Server-Timing on a fresh process shows no
    Redis span for the policy and no JWKS fetch in a route, and the tests pass.

- [ ] **4. Mobile API server path (F-184, F-185).**
  - `features/mobile/server/auth.ts`: start the `mobile_api` flag read
    alongside token verification.
  - `packages/mobile-api-core/src/setup.ts`: dedupe the setup check in flight
    per org and memo the answer briefly, as the web side does.
  - Memo the resolved mobile auth context per token hash for 5 seconds.
  - `fetchMobileScheduleEntries` (`data.ts:953-971`): run the comparison-rows
    query with the reference reads. Reuse the employee row auth already loads
    instead of `fetchLinkedEmployeeForUser` in `/me/schedule` and
    `/shift-requests`. Start the hidden-people lookup in the auth wave and memo
    it platform-wide for 30 seconds.
  - Tests: auth memo isolation between tokens and its expiry; setup dedupe;
    handler results unchanged.
    **Done when:** a cold `/bootstrap` and `/me/schedule` each show at least one
    fewer serial database wave in Server-Timing, and `npm run test:mobile` and
    the mobile route tests pass.

- [ ] **5. Mobile sign-in carries the bootstrap (F-182).**
  - `auth-login.ts` returns the bootstrap payload (optional field in
    `mobileAuthLoginResponseSchema`), built from what the handler already read.
  - `LoginScreen.tsx` seeds the bootstrap query from it and starts the Home
    prefetch at once; without the field it behaves as today.
  - Tests: contract parse with and without the field; the login screen seeding
    the cache.
    **Done when:** a simulator sign-in makes no `/bootstrap` request, and Home
    queries start as soon as login returns.

- [ ] **6. Mobile cold start overlaps (F-183).**
  - Chain the module-scope `warmSupabaseSession()` into
    `queryClient.prefetchQuery(createBootstrapQueryOptions(token))`, and start
    the theme read at module scope.
  - Count `MIN_SPLASH_MS` from launch, not from the gate's mount.
  - Tests: the startup gate with a bootstrap already in flight.
    **Done when:** on the iOS Simulator, the `/bootstrap` request starts before
    fonts finish loading (Metro log or network inspector).

- [ ] **7. Mobile persisted cache (F-181).** AsyncStorage (see Decision); needs
      a new development build.
  - Add the TanStack async-storage persister over AsyncStorage; persist only the
    bootstrap and Home keys under the rules in "Must hold".
  - `StartupSplashGate`: lift on a restored bootstrap for the same user and
    organization while the network refreshes.
  - Tests: restore, buster mismatch, sign-out clearing, an auth failure
    clearing and returning to sign-in.
    **Done when:** a cold open on the simulator with a cached session shows Home
    content before the bootstrap request returns, and sign-out leaves nothing
    persisted.

## Decision (step 7)

Owner, 2026-10-30: use `@react-native-async-storage/async-storage` with
TanStack's async-storage persister (`@tanstack/query-async-storage-persister`
and `@tanstack/react-query-persist-client`). The mobile app has only
SecureStore, which is unsuitable for a query cache (its 2,048-byte guidance,
F-128), so this adds a native module and needs a new development build.
Install the Expo-pinned version (`npx expo install`) and keep the lockfile
byte-stable otherwise. The persisted data is the user's own schedule and
organization setup, unencrypted in the app's sandbox, the same exposure as the
screens themselves.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, `npm run test:mobile`.
- Before and after, recorded in the fix's history entry:
  - Web, production mode (`next build` and `next start` in the worktree):
    sign-in to dashboard content and a cold `/dashboard` hard load, network
    waves and Server-Timing with `PERF_TIMING=1`, as
    `qa-super-admin@dubgrid.test`.
  - Mobile, iOS Simulator against the local stack: cold open to Home content
    and sign-in to Home content, following the simulator sign-in measurement
    recipe.
- Close-out: `/audit` re-reviews the eleven findings before `/complete`.

## Out of scope

- The realtime refetch storms (F-163, F-164, F-167), F-133's prerendering and
  F-169's router cache.
- F-176's `profiles` index (needs a migration after 113).
- Mobile two-factor round trips (F-186) and smaller startup costs (F-188).
