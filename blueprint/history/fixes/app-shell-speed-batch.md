# App shell speed fixes from the 2026-10-18 speed audit

**Type:** Fix
**Status:** verified (unit tests only, see Evidence)

## The problem

The 2026-10-18 speed audit found seven costs in the web app shell, the part
every signed-in page loads. Each was confirmed in the code.

1. **Permissions opened two realtime channels per consumer.**
   `usePermissions` subscribed to `organization_memberships` and `employees`
   in each of its roughly ten mounted consumers, and its effect depended on the
   access token, so every token refresh tore down and reopened all twenty.
   Opening Schedule writes `schedule_last_viewed_at` on the same membership
   row, which invalidated permissions in every open tab for nothing.
2. **Feature flags were fetched although the layout had already read them.**
   `useClientFeatureFlags` called `/api/feature-flags` on every hard load and
   on focus, while the `(app)` layout already loads the platform flag table
   (one cached read) for PostHog.
3. **The header refetched the account name on every token refresh.** Its
   effect was keyed on the `authUser` object, which every refresh replaces.
4. **Every hard load posted `/api/auth/track-session`.** The restored-session
   path had only a 5-second in-memory dedupe, which a reload discards.
5. **The first Supabase call paid DNS and TLS.** Nothing opened the connection
   early.
6. **The shell bundle carried rarely shown screens.** `OnboardingGate`
   statically imported `OnboardingWizard` (with the settings editors) and
   `SetupPendingScreen`, `TwoFactorReenrollGate` imported `MFASetup`, and
   `AppShell` imported `TrialWelcomeModal`. `/login` sits under the `(app)`
   layout, so it carried them too.
7. **Zod reached every page.** `instrumentation-client.ts` and `WebVitals`
   (root layout, so the landing page too) imported `clientEnv` for one value
   each.

## The fix

1. `features/permissions/permissionsRealtime.ts` holds one ref-counted
   membership and employees channel pair per user, following
   `useNotificationsRealtime`. `usePermissions` acquires it keyed on the user
   (and the org, because an org change can remove every channel through
   `AuthenticatedCacheBoundary` while consumers stay mounted), never the token.
   `organization_memberships` has the default replica identity, so the payload
   has no old values; instead the new row is rebuilt with `buildPerms` and
   compared with the cached permissions. Invalidation is skipped only when the
   cache exists, is for the row's organization, is not a Gridmaster,
   impersonation or inactive result, the row is not archived, carries
   `org_role` and `admin_permissions`, and rebuilds to identical permissions.
   Anything else invalidates, still with `cancelRefetch: false`. The employees
   channel always invalidates, as before.
2. `getClientFeatureFlags()` in `lib/feature-flags.ts` returns the same five
   client-visible flags `/api/feature-flags` returns (the route is unchanged).
   The `(app)` layout reads them alongside PostHog's and passes them to
   `QueryProvider`, which seeds the `featureFlags` query with the read time
   (clamped to the client clock) as its update time. The hook's 30-second
   staleTime and focus refetch then take over. No server-only flag is sent.
3. The header reads the identity through `useQuery` keyed on
   `account.identity(userId)`, under the `account` prefix that profile realtime
   already invalidates.
4. A successful report stores the session id and time in `sessionStorage`
   (`dg_session_reported`, every access in try/catch). The restored-session
   path skips the post when this tab reported the same session in the last 10
   minutes. `SIGNED_IN` and `TOKEN_REFRESHED` still always report.
5. The `(app)` layout calls React's `preconnect` (anonymous, as supabase-js
   fetches without credentials) and `prefetchDNS` for the Supabase origin. The
   CSP needs no change: the origin is already in `connect-src`, and a resource
   hint opens no fetch.
6. `OnboardingWizard`, `SetupPendingScreen`, `MFASetup` and
   `TrialWelcomeModal` load through `next/dynamic` with `ssr: false`. The two
   full-screen onboarding screens show the existing "Loading your workspace"
   splash while their chunk arrives; `MFASetup` and the trial modal show
   nothing (the modal renders nothing until its own query answers anyway).
7. Both files read `process.env.NEXT_PUBLIC_*` directly, which Next inlines,
   with a one-line lint exemption naming why.

Must not break: the server stays authoritative for permissions and flags (both
caches are UX only), permission changes and bench/activate still reach an open
tab at once, sign-in alerts and session registration on `SIGNED_IN`.

## Build steps

- [x] **1. One permissions channel pair per user.** Done when ten consumers
      open two channels, a token refresh opens none, a last-viewed write does
      not refetch, a role change refetches once, and the last unmount removes
      both, with tests.
- [x] **2. Flags seeded from the layout.** Done when the seeded query is fresh
      under the hook's staleTime and dated no later than the client clock, with
      tests.
- [x] **3. Header identity keyed on the user id.** Done when a token refresh
      (new user object, same id) does not refetch and a failure falls back to
      the email name, with tests.
- [x] **4. Restored-session report throttled.** Done when a stamp under 10
      minutes old for the same session skips the post, an older one posts and
      restamps, and unreadable storage posts, with tests.
- [x] **5. Supabase preconnect.** Done when the layout emits the hints.
- [x] **6. Rare screens lazy-loaded.** Done when the four imports are
      `next/dynamic` and the gate tests pass.
- [x] **7. No `clientEnv` in the boot files.**

## Verify

- `tsc --noEmit -p apps/web/tsconfig.json`, ESLint and Prettier on every
  changed file, and the focused web suites below.

## Evidence

- Web type-check: clean. ESLint and Prettier on the 20 changed files: clean.
- Focused suites, 26 files, 261 tests passing, including the new
  `permissionsRealtime` (5), `QueryProvider` (3), Header identity (2),
  restored-session throttle (2 unit, 2 provider), and the rewritten
  `usePermissions` realtime case. The new realtime, header and throttle tests
  fail against the old code (checked for the throttle by removing it).
- Not run: the full web suite, a production build, or a browser. So not
  verified: the emitted `<link rel="preconnect">` in real HTML, the chunk split
  and its size, that Zod no longer reaches the landing page (other root-layout
  imports were not traced), the splash during a real wizard chunk load, and the
  realtime payload shape from a live Supabase (the skip assumes `new` carries
  `org_role`, `admin_permissions` and `archived_at`; if it does not, every
  update invalidates as before).
