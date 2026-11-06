# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-18 [P3] fixed - The live MFA-policy integration test can lose its verified session under full-suite load

**File:** `apps/web/src/__tests__/mfa-enforced-in-policies.integration.test.ts:110`
**Found:** 2026-09-25 during 41b3's final gate (full `npm run test`)
**Why it matters:** The challenge verify returned no session once in a full run and passed in isolation (1/1). A TOTP window rollover or local Auth rate limit under parallel live tests are the likely causes; unproven.
**Suggested fix:** Generate the code for the verify moment and retry once on a window edge, or run the live tests serially.
**Resolution:** Seen again 2026-09-28 in a full `test:web` and passing alone. Fixed with the owner's approval (fix/mfa-policy-test-flake): the test answers the challenge through `answerChallenge`, which waits out a TOTP window edge before computing the code and, if the answer is refused, retries once in the next window with a fresh code. A second refusal fails with the auth server's error. It passed three runs in a row alone.

### F-62 [P2] fixed - Turning on `secure_password_change` would refuse password changes for two-factor users on sessions older than a day

**File:** `apps/web/src/features/account/client/step-up.ts:44`; `apps/mobile/src/features/profile/lib/step-up.ts:62`; `supabase/config.toml` (`secure_password_change = true`)
**Found:** 2026-09-26 during 41d3's production Auth review
**Why it matters:** Supabase Auth v2.187.0 (`internal/api/user.go:154`) refuses a password update without a reauthentication nonce when the current session started more than 24 hours ago. DubGrid's password step-up replaces the session, so it passes; its authenticator-code step-up keeps the old session, and neither app sends a nonce. Mobile sessions now last until sign-out, so with the setting on, a two-factor user could not change their password on mobile after the first day. Production has it off; local `config.toml` has it on, which the fresh sessions in tests never reach.
**Suggested fix:** Keep it off in production. Before turning it on, either send Supabase's reauthentication nonce with the update or have the authenticator-code step-up issue a fresh session; then set local and production alike.
**Resolution:** Fixed on fix/password-change-fresh-session, the owner's call being "pick the best decision" (2026-09-28): turn it on safely. A signed-in change (web and mobile) always signs in again first, with the current password and, for a two-factor account, its code, which the server answers on the new session. So every change runs on a brand-new session that `secure_password_change` accepts. Route and component tests cover the right, wrong and missing code, and the old code fails them. The owner turned the setting on in production on 2026-11-05, along with "Require current password when updating", which fix/password-policy-current-password supports by sending the current password.

### F-75 [P3] fixed - Database functions still let a stale Gridmaster token edit organization data

**File:** `supabase/migrations` (`check_admin_permission_for_org`, `is_authorized_org`, `publish_schedule` and the schedule, recurring and request functions that use them; `start_impersonation`; `force_logout_user`)
**Found:** 2026-09-26 while building 41d6
**Why it matters:** These SECURITY DEFINER functions are granted to `authenticated` and authorize a Gridmaster with `is_gridmaster()` alone, so a stale or stolen Gridmaster token can still edit schedules, publish, and settle requests in any organization by calling them through the data API. `start_impersonation` called directly also starts a session and its in-app notices without the route's audit row and email notice, and `force_logout_user` is gated in its route but not in the database. They are also how impersonated edits work, through routes that do not ask for fresh proof.
**Suggested fix:** A decision for the owner. Requiring `caller_has_fresh_proof()` for a Gridmaster in those checks closes it, but a Gridmaster editing schedules while impersonating would then be asked to confirm their identity every five minutes, and the schedule screens would need the step-up prompt wired in. Alternatively accept it: grants of authority and direct table writes are already closed (051 to 054).
**Resolution:** Narrowed by the owner's choice (2026-09-26, 41d7): migration 055 gives `start_impersonation` and `force_logout_user` the 051 guard, the impersonation route asks for fresh proof before a start (never before an end) and answers a database refusal with the prompt, and the portal runs the start through step-up; live tests prove both refuse a stale Gridmaster, work with fresh proof, and that a stale token still ends a session. Still open: the schedule, recurring, publish and request functions, left unchanged on purpose because fresh proof there would interrupt impersonated editing. Not accepted by the owner (2026-09-28), who also didn't want five-minute prompts. Fixed on fix/gridmaster-writes-need-impersonation: migration 075 binds a Gridmaster's authority over an organization's schedule, recurring, request, publish and job-override functions to an active impersonation of that organization, started by the same auth session. `requireOrgPermissions` applies the same rule to every write in those routes and to settings changes. The live test covers outside, inside, ended, expired and other-session impersonations, a non-Gridmaster, and the unguarded bodies' grants. It also found and fixed a NULL in the two org helpers that would have let the change fall through.

### F-78 [P3] fixed - A mobile sign-in that outlives the app's request timeout leaves an orphan server session

**File:** `apps/mobile` sign-in request (15 s client timeout); `apps/web/src/app/api/auth/login/route.ts`
**Found:** 2026-09-26 during the 41d3 Android rehearsal
**Why it matters:** On a slow server (18.6 s observed under load) the phone gives up while the server finishes, so a session is created that the phone never receives, and Security lists an extra signed-in device until it is revoked or expires.
**Suggested fix:** End the created session when the client has gone (for example, a short server-side deadline that signs the new session out), or let the next successful sign-in on that device replace the orphan.
**Resolution:** Fixed in f3eb3fe0 (fix/mobile-login-orphan-session), taking the first option. The mobile login handler is `apps/web/src/features/mobile/server/routes/auth-login.ts`, not the web route the finding names. Past `MOBILE_LOGIN_SERVER_DEADLINE_MS` (the client timeout less one second), or once `req.signal` reports the client gone, it ends the session it just created and answers 504 rather than returning tokens nobody is waiting for; returning them is what leaves the orphan, so the two are decided together. The ending is `endUserSession` with the user and session ids read back from the token just minted, never a `signOut` on the ephemeral client, whose default global scope would sign the person out on every device. Cleanup is best effort and its outcome is recorded as `sessionDiscarded`, since a sign-in already too slow to use must not also fail on tidying up. `MOBILE_REQUEST_TIMEOUT_MS` moved into `@dubgrid/contracts` because the server has to stay under the client's value and two copies would drift. The handler now changes a session, so `MOBILE_DELEGATES` classifies it with assertions pinning that the only session it can end is the one it just created for that request; a sensitive-action gate would be circular on the endpoint that mints the caller's first token (the findings session agreed). Three route tests cover the abandoned sign-in, a cleanup failure still answering 504, and a normal sign-in ending nothing. Not verified against a real slow server: the 18.6 s case came from a loaded Android rehearsal and was not reproduced.

### F-121 [P3] unverified - Latent inventory parser traps

**File:** `scripts/documentation/inventory.ts:531` (`resolveSourceModule`), walk helpers; `scripts/documentation/check.ts:84`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** each needs a real source to trigger it: an `@/` import in Settings would make the digest read a nonexistent path and crash; a `page.tsx` or `route.ts` under a Next private (`_x`) or `@slot` folder would count as a route; `statSync` follows symlinks, so a loop recurses; untracked local files feed the inventory, so `docs:check` can fail locally but pass in CI; with no `.gitattributes`, a CRLF checkout fails frontmatter parsing and the byte compare.
**Suggested fix:** resolve aliases through tsconfig paths, skip private and slot folders, walk with `lstat` and skip links, and add `* text=auto eol=lf` for the generated and docs files.
**Resolution:**

### F-122 [P3] unverified - The env-module declaration pattern could count any uppercase object key

**File:** `scripts/documentation/inventory.ts` (`discoverEnvironmentKeys`, schema-property match)
**Found:** 2026-09-28 by `/audit` (re-review of F-115 on feature/40a-docs-inventory)
**Why it matters:** in an `env.*` module every indented `UPPER_CASE:` key is recorded as a declared environment key, not only properties of the Zod schema. Every current match is a real schema key, so nothing is wrong today; a lookup table with uppercase keys in an env module would add phantom keys that then fail classification.
**Suggested fix:** read keys only from the object literal passed to `z.object(...)` (the TypeScript AST the route parser already uses), or accept the unclassified-key failure as the guard.
**Resolution:**

### F-123 [P3] fixed - Metro's image-size copies stay vulnerable until the Expo SDK upgrade

**File:** `package-lock.json` (`apps/mobile/node_modules/expo/node_modules/@expo/metro/node_modules/metro/node_modules/image-size`, and the copy under `react-native > @react-native/community-cli-plugin > metro`); Dependabot alerts 193, 194
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** image-size 1.2.1 loops forever on a crafted ICNS, JXL or HEIF file (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq). Metro uses it only to measure the app's own image assets during a bundle, so the exposure is a stalled build on a developer machine or in CI, not the shipped app or the web server. The fixed 2.0.3 is a major that measures only a buffer, while Metro 0.83.3 passes a file path, so an override would break every image asset; `@expo/metro` 54.2.0 pins metro 0.83.3 exactly, and metro 0.83.8, which drops image-size, is not taken by SDK 54. Moving only the React Native copy to 0.83.8 would leave the alert open through Expo's copy.
**Suggested fix:** Take the next Expo SDK (its `@expo/metro` moves to metro 0.84), then drop the image-size entry from `scripts/audit-check.mjs`. Until then the allowlist entry holds, review by 2026-11-01.
**Update 2026-10-31 (fix/dependency-audit-gate):** the allowlist entry's review date moved from 2026-11-01 to 2026-12-01, since SDK 54 still has no path to metro 0.83.8.
**Resolution:** Fixed on feature/56a-expo-sdk-57 (2026-10-31): Expo SDK 57 moves Metro past image-size, so `npm audit` no longer reports it and its allowlist entry is removed from `scripts/audit-check.mjs`.

### F-124 [P3] open - No upstream path clears decode-uri-component 0.2.2 in the mobile app

**File:** `package-lock.json` (`query-string` 7.1.3 under `expo-router` and `@react-navigation/native > @react-navigation/core`); Dependabot alert 174
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** decode-uri-component 0.2.2 decodes malformed percent-encoded input exponentially (fixed in 0.5.0). It ships in the mobile app, where it parses the app's own deep links, so the only trigger is a crafted link opened on the user's own device, which stalls that app. query-string 7 `require()`s it as CommonJS, and 0.5.0 is ESM-only, so an override would break link parsing; even the newest expo-router (57.x) still depends on query-string ^7.1.3.
**Suggested fix:** Revisit when expo-router and React Navigation move to query-string 9.5 or later (which depends on decode-uri-component ^0.5.0), normally with an Expo SDK upgrade. Medium severity, below the `deps:audit` gate, so no allowlist entry is needed.
**Update 2026-10-31:** GHSA-qr28-fpjm-wq7f (quadratic replacement, high, <= 0.5.0) joined the earlier advisory, putting the chain above the gate. Both are allowlisted until 2026-12-01 for the same reason: the fixes are ESM-only and query-string 7 needs CommonJS.
**Update 2026-10-31 (56a):** Expo SDK 57 still brings query-string 7.1.3 and decode-uri-component 0.2.2, so the allowlist entry stays.
**Resolution:**

### F-125 [P3] open - Vitest's mocker advisory needs the Vitest 4 major

**File:** `package.json` (`vitest` ^3.2.7, `@vitest/coverage-v8` ^3.2.7) and each workspace's Vitest config; Dependabot alerts 185, 186
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** `@vitest/mocker`'s redirect mock can read files outside the project (path traversal), fixed only in 4.1.11; every 3.x release is in range. Vitest runs only on developer machines and in CI over this repo's own tests, so the exposure is a crafted test or mock path in a change we review.
**Suggested fix:** Upgrade `vitest` and `@vitest/coverage-v8` to 4.1.11 or later in one change across web, mobile and the packages, following Vitest's 4.0 migration notes, and run every workspace's suite. Medium severity, below the `deps:audit` gate.
**Update 2026-10-13:** two critical tinypool advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr, prototype-pollution gadgets reaching code execution through worker options) now put Vitest 3 above the gate. tinypool 2.1.2 fixes them and Vitest 3 cannot take it. All three are allowlisted in `scripts/audit-check.mjs` until 2026-11-15 (fix/dependency-audit); do the upgrade (Vitest 5.0.4 is current) before then rather than re-dating the entry.
**Update 2026-10-31:** a fourth advisory, GHSA-qxg6-89mg-rqv8 (mock registration code injection, fixed in 4.1.12), joined the Vitest entry; its date stays 2026-11-15.
**Resolution:**

### F-126 [P3] open - Faker's code-execution advisory waits on @snaplet/copycat

**File:** `package-lock.json` (`node_modules/@snaplet/copycat/node_modules/@faker-js/faker` 8.4.1); `scripts/audit-check.mjs` allowlist; Dependabot alert 175
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** `faker.helpers.fake()` evaluates its template (GHSA-qxc2-j82w-r537, fixed in 10.5.0). Faker arrives only through the seed tooling (`@snaplet/seed` > `@snaplet/copycat`), whose templates we write, and nothing calls `helpers.fake` with outside input. copycat 6.0.0 is still its newest release and pins faker ^8.4.1, two majors below the fix.
**Suggested fix:** Take a copycat release on faker 10.5 or later when one ships, or replace the seed data generator. The allowlist entry holds until 2026-12-01.
**Resolution:**

### F-127 [P3] open - braces, node-forge and sprintf-js have no fix the mobile toolchain can take

**File:** `package-lock.json` (`braces` 3.0.3 under Metro, Jest, `eslint-config-next`, `shadcn` and `@snaplet/seed`; `node-forge` 1.4.0 under `@expo/cli`; `sprintf-js` 1.0.3 under `react-native`'s `babel-jest`); `scripts/audit-check.mjs` allowlist
**Found:** 2026-10-13 while clearing the `deps:audit` gate for release PR #131
**Why it matters:** GHSA-vfj7-8cjw-p6xm (braces stack exhaustion on a nested brace pattern) has no fixed release, nor does GHSA-86w9-cpqp-85rv (node-forge accepting extra data in a PKCS#1 v1.5 signature). GHSA-hp3w-g68c-fv3c (sprintf-js) is fixed only in 1.1.4, outside argparse 1's range. Every copy is build, bundling or test tooling. The patterns and configs are our own, and the app does not use Expo code signing. So the exposure is a hostile change we review, or a crashed build, not the shipped app or the web server.
**Suggested fix:** Take a braces or node-forge release when one ships. Otherwise take the Expo SDK upgrade (with F-123), which moves Metro and Jest. The allowlist entries hold until 2026-12-01.
**Update 2026-10-31:** the braces and sprintf-js advisories no longer appear in `npm audit`, so their entries were removed. node-forge gained eleven advisories; its fix 1.4.1 (2026-10-27) is inside the freshness window, and the entry now says to take 1.4.2 after 2026-11-03 (review 2026-11-10).
**Update 2026-10-31 (56a):** Expo SDK 57's `@expo/cli` still depends on node-forge 1.4.0; the entry stands.
**Resolution:**

### F-128 [P3] open - The mobile session is stored in one SecureStore value over its 2,048-byte guidance

**File:** `apps/mobile/src/shared/lib/local-storage.ts:32` (`setStoredValue`, the Supabase auth storage)
**Found:** 2026-10-22 during 40e4a's simulator and emulator qualification
**Why it matters:** Every sign-in logs Expo's warning that the value "is larger than 2048 bytes and it may not be stored successfully", and that a future SDK may throw. Today it is stored and restored: a cold start kept the session on the iOS Simulator and the Android emulator. If an SDK upgrade starts rejecting it, every sign-in would fail to persist, and people would be signed out on each launch.
**Suggested fix:** Store the session in chunks under the 2,048-byte guidance, or keep a key in SecureStore and the encrypted session in ordinary storage, with a migration that reads the old single value. Check before the next Expo SDK upgrade (with F-123).
**Update 2026-10-31 (56a):** expo-secure-store 57 no longer checks the value's size, so the warning is gone and nothing throws; the session survived a reinstall on the iOS Simulator. The value is still over Apple's guidance, so the finding stays open for a decision.
**Resolution:**

### F-129 [P2] fixed - Hard page loads wait on serial edge-to-Oregon round trips in the proxy

**File:** `apps/web/src/proxy.ts:367-395` (verify before anything else), `:126-146` (`readMemoized`: Redis, then the database), `:703-741`; `apps/web/src/lib/auth/verify-token.ts:69` (`createRemoteJWKSet`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Speed Insights (production, US desktop, p75) shows a 2.53s TTFB, about 70% of the 3.67s LCP. The proxy runs at the edge PoP, not in pdx1. On a fresh isolate it fetches the JWKS from Supabase (about 735ms measured 2026-09-26). It then reads org access as a Redis GET and, after the 10s memo and 30s Redis TTL lapse, a PostgREST query, one after the other. It verifies the token before starting those reads, though they need only `claims.org_id`. A hard load after idle hits every cold path.
**Suggested fix:**

- Verify against keys shipped with the build (`createLocalJWKSet`, falling back to the remote set on an unknown `kid`).
- Start the org reads from `decodeJwt` alongside `jwtVerify`.
- Read org visibility straight from the database rather than Redis then the database, or lengthen `mwOrgAccess`'s TTL (writers already invalidate it).
- Consider pinning the proxy to pdx1, checking `x-vercel-id` on a deploy.
- Measure first with `PERF_TIMING=1` and a `mw_session` span.
  **Resolution:** Fixed on fix/login-speed (2026-10-30): the proxy verifies with keys shipped in the build (`getProxyJwks`, remote only for a key added since) and reads org visibility and state from the memo straight to the database, dropping the Redis layer and its writers. Local Server-Timing on a fresh process: `jwt_verify` 35 to 1.2ms, `mw_org_access` 472 to 128ms. Not done: overlapping the org reads with verification (nothing left to overlap) and pinning the proxy to pdx1 (would add a hop to static public pages). Re-examined 2026-10-30 (second /audit pass): verification and org access hold, so it stays fixed. Not closed: the billing-policy leg of the same `Promise.all` still goes Redis then database (F-157), route handlers still verify against the remote key set (F-158), and the post-idle token refresh runs before the org reads (F-159).

### F-131 [P2] fixed - App pages paint nothing until the browser re-checks the session over the network

**File:** `apps/web/src/components/RouteGuards.tsx:94-100`; `apps/web/src/components/AuthProvider.tsx:90-102`; `apps/web/src/lib/browser-auth.ts:190-198`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `ProtectedRoute` shows `BrandLoadingScreen` while `isLoading || !user`. `isLoading` clears only after `getBrowserAuthSession()` and then `supabase.auth.getUser()`, which is a round trip to Supabase Auth. Only then do permissions, bootstrap and the page's queries start. The server has already verified the token, so this is a client waterfall in front of every signed-in page, on top of downloading and hydrating 450-620 KB gzip of JS.
**Suggested fix:** Seed `AuthProvider` with the user and claims the server verified, so `isLoading` starts false, and run `getUser()` in the background as revalidation. Next step: server-prefetch the org bootstrap into the QueryClient.
**Resolution:** Fixed on fix/login-speed (2026-10-30): the `(app)` layout passes the user id its check verified, and `AuthProvider` paints with the cookie session's user when it matches and the token is unexpired, running `getUser()` behind it; a failed check signs out as before. Tested (`AuthProvider.test.tsx`), and seen in the browser: page queries start before `getUser`. Re-examined 2026-10-30 (second /audit pass): holds for hard loads. Not closed: the soft navigation after sign-in still waits on the browser `getUser` (F-155), two-factor sign-in repeats it (F-160), and the background `getUser` holds the auth lock (F-162).

### F-132 [P2] fixed - The sign-in pages load the whole signed-in app shell

**File:** `apps/web/src/app/(app)/login/`, plus `forgot-password`, `reset-password`, `accept-invite` and `auth/verify` under `(app)`; `apps/web/src/app/(app)/layout.tsx:47, 79-126`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `/login` (Speed Insights 73) inherits `force-dynamic`, the layout's session and flag reads, and AuthProvider, QueryProvider, PostHog, AppShell, Header and `app-ui.css`. A production build puts its first-load JS at about 470 KB gzip, more than `/dashboard`. PageSpeed (desktop, 2026-10-30) scored it 76, with 460ms Total Blocking Time and 221 KiB of unused JS, 141 KiB of it in one chunk. It also reports an unused Supabase preconnect and 43 KiB of render-blocking CSS; on mobile that CSS is 1.33s of LCP render delay against a 20ms TTFB.
**Suggested fix:** Move the sign-in routes into a sibling group such as `(auth)` with a thin layout holding only what `OrgLogin` needs (AuthProvider, QueryClient, SignInPrefetch). Keep `app-ui.css` and AppShell out of it.
**Resolution:** Fixed on fix/login-speed (2026-10-30), differently from the suggestion: the sign-in pages stay under `(app)` (they need its auth provider, query cache and `app-ui.css`), and `AppChrome` loads the shell through `next/dynamic` everywhere else. First-load JS gzip: `/login` 467 to 413 KB, `/accept-invite` 467 to 381 KB, `/forgot-password` 461 to 371 KB. Re-examined 2026-10-30 (second /audit pass): holds for `/login`'s own bundle. Not closed: the repair added a chunk download in series after sign-in (F-154), and `SignInPrefetch` still pulls app modules into `/login` (F-161).

### F-133 [P3] unverified - Every signed-in route renders in a function because the nonce CSP forbids prerendering

**File:** `apps/web/src/app/(app)/layout.tsx:47` (`export const dynamic = "force-dynamic"`); `apps/web/src/proxy.ts:217-219, 269-273`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** The pages render no server data, so their shell could come from the CDN. Instead each hard load invokes a function, which can cold start. The cold-start share of TTFB is unmeasured.
**Suggested fix:** Check Vercel's function cold-start metrics first. If they matter, move to a hash-based CSP or SRI (`experimental.sri`) and drop `force-dynamic` for shell routes. This is architectural, so do it after F-129 to F-132.
**Resolution:**

### F-134 [P2] open - Sentry's full SDK, Session Replay included, downloads and parses on every page at boot

**File:** `apps/web/src/lib/sentry.ts:84` (`void import("@sentry/nextjs")` at module load); `apps/web/src/instrumentation-client.ts:60-68`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** The async chunk is 588 KB raw / 184 KB gzip and contains rrweb and `replayIntegration`, though Replay only attaches with consent. It competes with page chunks for bandwidth and the main thread during hydration, which feeds TBT and INP.
**Suggested fix:**

- Import the SDK on `requestIdleCallback` or after `load`; the existing queue already covers early errors.
- Load Replay through `lazyLoadIntegration` only after consent.
- Add Sentry's `bundleSizeOptimizations` (exclude the replay iframe, shadow DOM and worker).
  **Resolution:**

### F-135 [P2] open - Each staff-search keystroke re-renders every Schedule grid section

**File:** `apps/web/src/components/ScheduleGrid.tsx:1076-1090` (`sectionBlockPropsAreEqual`); `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:2920-2930`; `Toolbar.tsx:636`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `searchMatchedEmployeeIds` is a new Set per keystroke and reaches every section as `highlightEmpIds`. The comparator returns false for any changed prop outside `CELL_READ_KEYS` and `CONTENT_COMPARED_KEYS`, and this one is in neither. Rows and cells are not memoized, and React Compiler is off, so every cell re-renders while typing. `MonthView` is not memoized either. This is a likely part of the 360ms p75 INP.
**Suggested fix:** Pass `useDeferredValue(staffSearch)` (or a 150ms debounce) to the grid. Compare `highlightEmpIds` by membership for the section's own employees. Wrap `MonthView` in `memo`.
**Resolution:**

### F-136 [P2] open - The Schedule Builder's suggestion engine re-runs synchronously in render every 30s and on every edit

**File:** `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:651-654` (30s `setCurrentTimeTick`), `:3474-3480`, `:7134-7158` (`suggestCoverageFixes` in `useMemo`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** While the panel is open, the clock tick changes `hasDateAndTimeStarted`. That rebuilds `coverageMatrix` and re-runs the whole engine every 30s even when nothing changed, and again on every save and peer broadcast. Its own speed test measures about 40ms on a laptop for 40 people over 14 days, so a slower device lands a long task on whatever the user clicks.
**Suggested fix:** Round the tick to the next shift start or keep it in a ref, so it changes only when a shift actually starts. Compute suggestions in a transition or a Web Worker (the input is plain data), and debounce after edits.
**Resolution:**

### F-137 [P2] unverified - Per-save grid commit cost grows with cells

**File:** `apps/web/src/components/ScheduleGrid.tsx:1091-1098` (comparator re-reads every cell twice), `:5202-5300` (two employee-by-day scans per section), `:604-760` (a Popover root per cell); `DroppableCell.tsx:25`, `DraggableShift.tsx:23`; `apps/web/src/hooks/useSchedulePresence.ts:531` (`cellEditors`, not in the comparator)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- Every `setShifts` changes every accessor. The comparator then runs `readSectionCell` (about 25 lookups, a `JSON.stringify` and a linear `requests.find`) on both sides for every cell.
- Each section scans all employees by days twice.
- Every cell carries a Popover root and dnd-kit hooks.
- A peer's focus rebuilds `cellEditors` and re-renders all sections in other tabs.
- The size is unprofiled.
  **Suggested fix:** Profile a save, a drag and a peer focus in a 2-week view of a large org. Then:
- pass per-section change versions from the save path;
- index requests by key;
- build the guest index once;
- use one delegated hover card;
- give each section only its slice of `cellEditors`.
  **Resolution:**

### F-138 [P2] open - Returning to the Schedule tab refetches and replaces the whole ±90-day window

**File:** `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:2660-2661`, `:1308-1366` (`refetchScheduleData`), `:2323-2335` (publish and discard broadcasts); `_lib/schedule-cache.ts:42`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** After 10s away, or on any publish or discard in the org, every open tab fetches 180+ days of shifts and notes. It replaces every entry (so F-137's work runs for every cell) and `setQueryData` deep-compares the whole map through structural sharing.
**Suggested fix:**

- Refetch the visible period first and backfill on idle.
- Keep entry identity when unchanged.
- Set `structuralSharing: false` on the schedule cache key.
  **Resolution:**

### F-139 [P2] open - The staff page waterfalls and fetches the whole organization's records for one person

**File:** `apps/web/src/components/staff-detail/StaffDetailPage.tsx:291-308` (`fetchEmployeeById`, then `fetchRecurringShifts`), `:976` (every profile change request), `:1014-1033` (org-wide corrections and notes over up to a year, filtered on the client), `:983` (`directory.find` per row)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `/people/[id]` scores 74 and ships 538 KB gzip of first-load JS. Its data cost grows with the organization rather than the person.
**Suggested fix:** `Promise.all` the two fetches. Filter corrections, notes and change requests by `emp_id` on the server. Use a Map for the directory.
**Resolution:** Re-examined 2026-10-30 (second /audit pass) after the staff page rework: shift requests are now filtered by `empId` (`StaffDetailPage.tsx:962`). Still open: the employee-then-recurring waterfall (`:295-318`), organization-wide corrections and notes filtered on the client (`:1002-1019`, `:1038-1056`), every profile change request (`:969-978`) and `directory.find` per row (`:984`). See also F-168.

### F-140 [P3] open - Code splitting gaps across signed-in routes

**File:**

- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:29, 38-40, 66` (MonthView, PublishHistoryPanel and modals imported statically)
- `components/staff-detail/StaffDetailPage.tsx:10-16, 89` (the invite, access and edit modals)
- `app/(app)/settings/page.tsx:7` (static `BillingSettings`, which defeats `SettingsPage.tsx:93`'s `dynamic()`)
- `components/Header.tsx:33, 41-43` (sandbox and nav dialogs)
- `lib/subdomain.ts:1` (pulls zod onto the landing page)
- `app/layout.tsx:38-52` (DM Sans and DM Mono preloaded on every route)
  **Found:** 2026-10-30 by /audit (scope: full; lens: performance)
  **Why it matters:** First-load JS is 612 KB gzip on `/schedule` and 538 KB on `/people/[id]`. Most of the code above runs only on a click.
  **Suggested fix:**
- `next/dynamic` each on-demand component.
- Load dnd-kit only for editors.
- Read `NEXT_PUBLIC_*` directly in `subdomain.ts`.
- Preload only Inter in the root layout.
  **Resolution:**

### F-141 [P2] unverified - RLS policies call SECURITY DEFINER helpers per row instead of once per query

**File:** `supabase/migrations/003_rls_policies.sql:578-590, 937-941`, `035_draft_state_editor_only.sql:12-35`, and the `gridmaster_all_*` policies; helpers in `016_harden_authorization_boundaries.sql:32` and `002_functions_triggers.sql:88-102`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** 221 policy uses of `caller_org_id()` and none wrapped as `(SELECT ...)`, likewise `check_admin_permission`, `is_gridmaster` and `auth.uid()`. Unwrapped, Postgres may evaluate them per row; each queries membership tables. The grid reads cells, snapshots and segments through RLS with the browser client (`lib/db/shifts.ts:54-66`), and Realtime re-checks policies per change per subscriber.
**Suggested fix:** EXPLAIN ANALYZE a grid read on a seeded large org. If the helpers appear per row, add a migration recreating the hot policies with `(SELECT public.caller_org_id())` and the like.
**Resolution:**

### F-142 [P2] open - The hourly expiry cron re-dispatches every lapsed invitation, forever

**File:** `apps/web/src/app/api/cron/expire-requests/route.ts:85-105`; `apps/web/src/app/api/cron/trial-expiry/route.ts:111-145` (pass 2, daily)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- The query selects every expired, unaccepted, unrevoked invitation, with no "notified" marker and no ORDER BY, and `.limit(500)`.
- It dispatches each one serially. Each dispatch runs three lookups before its dedupe check.
- The work grows with every invitation that ever lapses. Past 500, newly lapsed ones may never be picked.
- The cron routes set no `maxDuration`.
- Trial-expiry pass 2 re-dispatches every expired, never-paid organization daily.
  **Suggested fix:** Bound the window (`expires_at > now() - interval '2 hours'`) or add an `expiry_notified_at`. Add an ORDER BY. Dedupe before the lookups. Set `maxDuration`.
  **Resolution:**

### F-143 [P2] unverified - The notification dedupe has no index to use, and notifications are never pruned

**File:** `apps/web/src/features/notifications/server/events.ts:1462-1474` (`hasExistingNotification`: `org_id`, `type`, `metadata->>key`); notifications indexes in `001` all lead with `user_id`; `sender.ts:289` (an email-tracking row per email)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Likely a scan of the org's notifications on each dedupe. The crons in F-142 and the Stripe webhook call it per row, and the table only grows.
**Suggested fix:** EXPLAIN it. Add a partial index on `(org_id, type)` or dedupe per recipient through the `user_id` index. Add retention for read, archived and email-tracking rows.
**Resolution:** Re-examined 2026-10-30 (second /audit pass): no notifications index leads with `org_id` (`001:1432-1436`), so the dedupe can only filter after reading across organizations; five overlapping `user_id` indexes also slow every insert. Still needs EXPLAIN.

### F-144 [P2] open - Creating or answering a shift request waits for every approver's alert to send

**File:** `apps/web/src/app/api/schedule/requests/route.ts:238, 256, 562, 606, 663`; `packages/mobile-api-core/src/shift-requests.ts:168, 180, 550, 573, 594`; `apps/web/src/features/notifications/server/sender.ts:152-300`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** These handlers `await` the dispatch. Per recipient, `sendNotification` makes 6-8 sequential calls (facts, insert, Expo push, preferences, throttle, dedupe, `getUserById`, org name, Resend, insert) before the requester gets a response.
**Suggested fix:** `after(() => dispatchNotificationEvent(...))`, as `shifts/publish/route.ts:149` already does.
**Resolution:**

### F-145 [P1] fixed - About 15 fire-and-forget alert dispatches may be cut off after the response

**File:** for example `apps/web/src/app/api/employees/manage/route.ts:691, 964`, `schedule/manage/route.ts:2535, 2607`, `stripe/webhook/route.ts:142`, `features/mobile/server/routes/people.ts:254`, `organizations/access/route.ts:379` (`void dispatchNotificationEvent(...)`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** On Vercel, work left running after a response is not guaranteed to finish without `after()` or `waitUntil`, so these alerts and emails could be dropped silently. Unconfirmed: whether production's function settings let them finish.
**Suggested fix:** Wrap each in `after()`. To confirm, compare sent-alert rows against the triggering audit rows in production.
**Resolution:** Fixed on fix/alerts-finish-after-response (2026-11-02): all 18 `void dispatchNotificationEvent(...)` calls in server code run in `after()`, and the lint rule `design/no-floating-server-work` fails a `void <call>` or a floating `call().then/catch(...)` in `app/api` and `features/**/server`. Not checked: whether production actually dropped alerts before.

### F-146 [P2] open - Publish alerts fan out with no concurrency limit and a query chain per recipient

**File:** `apps/web/src/features/notifications/server/publish-alerts.ts:126-147`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `Promise.allSettled` over every affected person, each through F-144's 6-8 call chain. A 150-person publish is about 1,200 queries and 150 concurrent Resend calls. Resend failures are only logged, so a rate limit would drop emails silently.
**Suggested fix:**

- Load contacts, preferences and throttle counts for all recipients in one query each.
- Bulk-insert the in-app rows.
- Cap concurrency.
- Use Resend's batch send.
  **Resolution:**

### F-147 [P2] unverified - Publish reads every cell in the period, not only the changed ones

**File:** `supabase/migrations/092_absence_times.sql:966-1015` (`publish_schedule_unguarded`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- For every cell in the range it calls two non-inlinable SECURITY DEFINER lateral functions (the draft and published payloads), even when a few cells changed.
- `v_changes := v_changes || jsonb_build_array(...)` copies a growing array each time, which is O(n²).
- Unmeasured.
  **Suggested fix:** EXPLAIN on a month publish in a large org. Restrict to cells with a draft snapshot (`EXISTS`), and build changes with `jsonb_agg` or direct inserts. Check discard for the same shape.
  **Resolution:**

### F-148 [P2] open - Batch cell saves query per cell

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1502` (`Promise.all` over up to 50 cells), `:1037-1058`, `:805-808` (`readCellStateForAudit`), `:949+`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Each cell makes two before-state reads, an RPC, possibly a note clear and an audit insert. That is about 150-200 round trips per 50-cell batch, which is how bulk edits, paste and Auto-build Apply save.
**Suggested fix:** One before-state read and one audit insert per batch, with bounded concurrency. A set-based RPC later.
**Resolution:**

### F-149 [P3] open - Smaller server data costs

**File:**

- `apps/web/src/lib/db/shifts.ts:56-58` (unused nested columns)
- `lib/db/shared.ts:229-245` (serial OFFSET paging of 500 rows)
- `get_notification_facets` in `002` (five COUNT scans)
- `lib/audit/employee-activity.ts:261-281` (an OR branch on `details->>employeeId`, unindexed, the F-92 pattern)
- `events.ts:221-234` and `schedule/publish-history/route.ts:88` (independent queries in series)
- `mobile.ts:1379-1400` (mobile People reads every employee ever)
- `return-from-away` and `expire-requests` per-row loops
  **Found:** 2026-10-30 by /audit (scope: full; lens: performance)
  **Why it matters:** Each is small today and grows with org size or history.
  **Suggested fix:**
- Trim the nested selects and use keyset paging.
- Use a single `COUNT(*) FILTER` scan.
- Add an expression index on `audit_log ((details->>'employeeId'))`.
- `Promise.all` the independent reads.
- Leave Offboarded people out of the mobile list by default.
- Use set-based cron updates.
  **Resolution:**

### F-150 [P2] open - Every member's phone refetches after every schedule edit, drafts included, several times over

**File:** `apps/mobile/src/shared/hooks/useMobileRealtimeInvalidation.ts:12-36, 82-84`; `apps/mobile/src/shared/lib/mobile-realtime-invalidation.ts:76-79, 93-95`; `packages/realtime-core/src/debounced-flusher.ts:35-36`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- Every signed-in user subscribes to the draft tables (cells, snapshots, segments), so a manager's draft edit or an Auto-build Apply refetches schedule, requests and dashboard on every staff phone.
- The flusher is a fixed 150ms window, not trailing, so a burst means a refetch about every 150ms.
- `onFlush` invalidates once per table, cancelling and restarting the same families about three times.
- `audit_log` events refetch bootstrap for Super Admins on almost any action.
- The cost lands on the battery and on the server.
  **Suggested fix:**
- Call `invalidateMobileRealtimeQueriesForTables` once per flush.
- Make the flusher trailing with a 1-2s max wait.
- Have non-editors key schedule refetches off `publish_history`.
- Drop `audit_log` from the mobile subscription.
  **Resolution:**

### F-151 [P2] open - Mobile schedule endpoints load every publish change in the organization and scan it per entry

**File:** `packages/data-access/src/mobile.ts:917-918` (unfiltered `schedule_publish_changes` embed); `apps/web/src/features/mobile/server/data.ts:1012` (`findPublishedChangeForCell` per row), `:867`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** One person's week on `/me/schedule`, `/org/schedule` or `/shift-requests` pays for every employee's changes in every overlapping publish. That is O(rows × changes), with two Zod parses per change. F-150 makes these calls frequent.
**Suggested fix:** Filter the embed by `emp_id` (when scoped) and date, and index changes in a `Map` keyed `emp:date` before the loop.
**Resolution:**

### F-152 [P2] open - Mobile fetches the same data under several keys and refetches more than it needs

**File:**

- `apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx:752`, `useMyScheduleQuery.ts:33`, `RequestsScreen.tsx:444` (`/me/schedule` under three keys)
- `usePrefetchOtherDashboardPeriod.ts:46` (re-prefetches on each refetch)
- `ScheduleScreen.tsx:826-831` (a request action refetches requests twice plus bootstrap)
- `NotificationsScreen.tsx:172-180` with `useMobileNotificationsRealtimeTick.ts:50` (the channel rejoins every render)
- `packages/mobile-api-core/src/shift-requests.ts:395-410` (one RPC per awaiting request)
  **Found:** 2026-10-30 by /audit (scope: full; lens: performance)
  **Why it matters:** Each schedule event can refetch identical data three times. The admin dashboard costs four requests instead of two. Alerts can miss events while the channel rejoins. The approver's request list is N+1.
  **Suggested fix:**
- One key family for `/me/schedule`.
- Drop `currentUpdatedAt` from the prefetch deps.
- Invalidate only `requests` after an action.
- Hold `onChange` in a ref.
- Make a batch draft-cells RPC, or load the cells when Approve opens.
  **Resolution:**

### F-153 [P3] open - Mobile startup and list rendering costs

**File:** `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:223` and `StartupSplashGate.tsx:76-104` (session, then bootstrap, then the Home prefetch); `apps/mobile/src/shared/components/Screen.tsx:335, 349` (inline `renderItem`, and a new separator component type each render); `ScheduleScreen.tsx:680` (a one-minute clock re-renders the screen)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Three round trips in a row before Home has content. Separators remount and rows re-render on each keystroke or refetch. Needs on-device profiling.
**Suggested fix:**

- Start `/me/schedule` alongside bootstrap.
- Use a stable `renderItem` and separator, and memo the rows.
- Push `now` down to the rows that show relative time.
  **Resolution:** Re-examined 2026-10-30 (second /audit pass): confirmed at the cited lines, so moved to open. It missed the token refresh before bootstrap, fonts and the theme read gating bootstrap (F-183), Home content being a further wave after the splash, and the missing persisted cache (F-181).

### F-154 [P2] fixed - After sign-in, the app shell's code downloads only once the dashboard has rendered on the server

**File:** `apps/web/src/components/AppChrome.tsx:10`; `apps/web/src/components/dashboard/preloadDashboardView.ts:5`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** F-132's fix keeps `AppShellProviders` (AppShell, Header, the gates) off `/login`. After `router.replace`, `AppChrome` asks for that chunk only when the new pathname commits, which needs the `/dashboard` RSC response first. `preloadDashboardView()` runs on submit but warms only `DashboardView`. So every cold sign-in now has one extra chunk round trip and download (about the 54 KB gzip cut from `/login`) in series before the dashboard can paint.
**Suggested fix:** Also `import("@/components/AppShellProviders")` inside `preloadDashboardView()`.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): `preloadDashboardView()` also imports `AppShellProviders`; in the browser the shell chunk is requested 23ms after submit, beside the login POST.

### F-155 [P2] fixed - After a password sign-in, the splash still waits on the browser's own `getUser` round trip

**File:** `apps/web/src/components/OrgLogin.tsx:424`; `apps/web/src/features/account/client/auth.ts:162`; `apps/web/src/components/RouteGuards.tsx:94`; `apps/web/src/components/onboarding/OnboardingGate.tsx:55`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The login route already wrote the session cookies, but the user appears in `AuthProvider` only through the `SIGNED_IN` that `setSession` emits after a browser-to-Supabase `/auth/v1/user` call, which also holds the auth lock. F-131's fast path covers hard loads, not this soft navigation, so the round trip sits on the sign-in critical path whenever it is the slowest of the parallel calls.
**Suggested fix:** Once `sessionCookieSet` is true, have `AuthProvider` read the cookie session (no network) and commit it as server-vouched, as F-131 does on a hard load; run `getUser` behind it.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the login route returns the whole signed-in user, and `syncBrowserSessionInBackground` announces the route's session to `AuthProvider` before `setSession`'s round trip; a refusal still signs out. Tested in `AuthProvider.test.tsx` and `auth.session-sync.test.ts`. Not measured on production.

### F-156 [P2] fixed - A cold hard load of the dashboard takes three API waves; only sign-in is primed

**File:** `apps/web/src/app/(app)/dashboard/DashboardPageContent.tsx:64, 119`; `apps/web/src/components/AppShell.tsx:60`; `apps/web/src/components/SignInPrefetch.tsx:119-126`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Wave 1 is permissions, bootstrap and org context. Wave 2 is the employee roster, which waits for `perms.orgId` though `org_id` is in the session token, and `DashboardContent` mounts only once permissions load. Wave 3 is the dashboard data, because `DashboardView` mounts only after the roster, though `primeDashboardQueries` needs only bootstrap and permissions. `SignInPrefetch` primes all of this only while a sign-in handoff is pending, so a reopened tab or bookmark pays one avoidable API round trip (function time included) on every cold open. A Super Admin's header adds billing, then employees.
**Suggested fix:** Run the sign-in priming on hard loads too, from the server-vouched session, and start the roster from the token's `org_id`.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): `SignInPrefetch` primes once on a hard load from the vouched session, the roster with the dashboard only. In the browser a cold `/dashboard` now asks in two waves: permissions, bootstrap, org context, terms, billing and the roster together, then the dashboard's data when bootstrap answers.

### F-157 [P2] fixed - The platform billing policy is still read Redis then database, after the org reads, on every page load and API call

**File:** `apps/web/src/lib/billing-policy.ts:82-95` (`getPlatformBillingPolicy`, 10s memo then `cacheThrough`); `apps/web/src/proxy.ts:701-728`; `apps/web/src/app/api/shared/permissions.ts:457-477, 535, 545`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** F-129 dropped Redis for org visibility and access, but the billing-policy leg in the same `Promise.all` still does an edge-to-Upstash GET and, on a miss, a PostgREST query, one after the other, so after a minute idle it can still be the slowest leg of `mw_org_access`. In `requireOrgPermissions` it is worse: revocation (Redis), then three database reads in parallel, then the policy (Redis, then database), then "setup complete" (Redis), four serial waves before the handler starts, though the last two need only `orgId`. The proxy's missing-claims fallback (`proxy.ts:436-470`) also still uses `cacheThrough`.
**Suggested fix:** Read the policy straight from the database with a 5-minute memo (it changes rarely), or return it with the org row in one RPC. In `requireOrgPermissions`, start the policy and setup reads inside the same `Promise.all` as the database wave and ignore the setup result for Gridmasters.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the platform policy is read from the database with a one-minute memo and one read in flight (no Redis), and `requireOrgPermissions` starts the policy and setup reads with its database wave. The proxy's missing-claims fallback still uses `cacheThrough`.

### F-158 [P2] fixed - Route handlers and the app layout verify tokens against the remote key set

**File:** `apps/web/src/lib/auth/verify-token.ts:164-170` (`verifyAccessToken` uses `getSupabaseJwks`, a `createRemoteJWKSet`); callers include `apps/web/src/app/(app)/layout.tsx:56-71` and every `/api` route
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** F-129's build-shipped keys (`getProxyJwks`) went into the proxy only. Each fresh function instance fetches the JWKS from Supabase Auth before its first verify, and each route can be its own function, so cold API calls and the layout's first byte pay that round trip. Size from pdx1 is unmeasured (about 735ms from the edge on 2026-09-26). The layout also awaits `layout_client_flags` after its `Promise.all` (`:93-95`) instead of inside it.
**Suggested fix:** Verify with `getProxyJwks()` in `verifyAccessToken` (same remote fallback on an unknown `kid`), and move the flags read into the layout's `Promise.all`. Confirm the production build actually carries `SUPABASE_JWKS`: `next.config.ts:179-193` falls back to remote silently when the build's fetch fails.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): `verifyAccessToken` uses the build-shipped keys (`getProxyJwks`), the runbook says to redeploy after revoking a key since routes now trust shipped keys too, the layout reads client flags alongside the session, and the build log says when keys could not be shipped (a failed build would break CI builds without Supabase).

### F-159 [P3] unverified - After about an hour idle, the proxy refreshes the token before it starts the org reads

**File:** `apps/web/src/proxy.ts:351` (`getSession`), then `:701`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** A token near expiry is refreshed (a Supabase Auth round trip plus the access-token hook) before any org read starts, so the first page after idle pays both in series. F-129's "nothing left to overlap" considered only verification. Size unmeasured.
**Suggested fix:** Start the org and policy reads from `decodeJwt` of the cookie token alongside `getSession()`, and use them only if the verified `sub` and `org_id` match.
**Resolution:**

### F-160 [P3] open - A two-factor sign-in makes two or three redundant `getUser` round trips

**File:** `apps/web/src/components/MFAVerify.tsx:104-108`; `apps/web/src/components/AuthProvider.tsx:197-202`; `apps/web/src/components/OrgLogin.tsx:433-450`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** After the code, `challengeAndVerify` has saved the session and emitted `MFA_CHALLENGE_VERIFIED`, but `AuthProvider` doesn't trust that event and calls `getUser` under the auth lock; `MFAVerify` then calls `setBrowserSession`, a second `getUser` queued behind it; `proceed()` waits on both. Before the form shows, the browser waits on `setSession`'s `getUser`, then `listFactors` calls `getUser` again.
**Suggested fix:** Trust `MFA_CHALLENGE_VERIFIED` (its response carries the user), drop the extra `setBrowserSession` once E2E confirms the aal2 cookie, and return `factorId` from the login route.
**Resolution:**

### F-161 [P3] unverified - `SignInPrefetch` pulls dashboard, roster and billing modules into the `/login` bundle

**File:** `apps/web/src/components/SignInPrefetch.tsx:9-16`, imported by `apps/web/src/app/(app)/layout.tsx` and `OrgLogin.tsx:12`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** It statically imports `dashboardQueries` (shift requests, shift-change formatting, schedule view), `useOrganizationData`, `useEmployees` (realtime-core, step-up) and the gridmaster and billing clients, all of which run only after a submit. Not in F-140; size unmeasured.
**Suggested fix:** Move the priming into a module loaded with `import()` on submit.
**Resolution:**

### F-162 [P3] unverified - The background `getUser` on a hard load holds the auth lock that browser queries wait on

**File:** `apps/web/src/components/AuthProvider.tsx:138`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** auth-js keeps its lock across the `getUser` network call, and every browser-direct query (schedule cells and notes in `lib/db/shifts.ts`, realtime `setAuth`) calls `getSession`, which queues behind it. Probably hidden behind the bootstrap wave; unmeasured.
**Suggested fix:** Call `getUser(session.access_token)`, which skips the lock.
**Resolution:**

### F-163 [P2] open - One realtime event is invalidated once per table and re-broadcast to tabs that already received it

**File:** `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:184-190` (`invalidateOrgRealtimeQueries`), `:226-229` (`onFlush`); `apps/web/src/lib/cache-broadcast.ts:39-43`; `packages/realtime-core/src/debounced-flusher.ts`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** A cell save touches `schedule_cells`, `schedule_cell_snapshots` and `schedule_cell_segments`, which map to the same keys, so each key is invalidated three times per flush with the default `cancelRefetch`, restarting fetches whose requests still go out. Every invalidation is also broadcast to other tabs, which got the same event on their own channel and invalidate again, so load grows with the square of open tabs. The 150ms fixed-window flusher fires about seven times a second through a paste or Auto-build Apply. `permissionsRealtime.ts:63-66` already uses `cancelRefetch: false`. The web side of F-150.
**Suggested fix:** Collect the union of keys per flush and invalidate each once with `{ cancelRefetch: false }`; don't re-broadcast keys that came from realtime; make the flusher trailing with a 1-2s max wait.
**Resolution:**

### F-164 [P2] open - Draft edits regenerate the published-only operations report

**File:** `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:138-145`; `apps/web/src/app/(app)/reports/ReportsPageContent.tsx:479-497`; `apps/web/src/features/reports/server/operations.ts:477, 942`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `reports.operationsAll` is invalidated on every change to the three cell tables, though the report reads published data only. A manager with a long-range report open has it re-aggregated on the server on every peer's draft save, multiplied by F-163.
**Suggested fix:** Drop `reports.operationsAll` from the cell-table cases; keep it for `publish_history`, `employees` and `recurring_shifts`.
**Resolution:**

### F-165 [P2] fixed - The header loads the organization's whole roster on every page for one boolean

**File:** `apps/web/src/components/AppShell.tsx:60-63`; `apps/web/src/hooks/useEmployees.ts:130-135`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `useEmployees` fetches every employee, archived included, only for `employees.length > 0` in the setup lock. It mounts on every app route, staff included, and keeps `employees.all` observed everywhere, so every employee, department, certification or role change refetches the full roster in every tab. It is also wave 2 of F-156.
**Suggested fix:** Use `useEmployeeCount` (already keyed under `org.employeeCount`), or enable the roster only while onboarding is incomplete.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the header reads the bootstrap's `activeEmployeeCount`, as `SetupGuard` does; in the browser `/alerts` loads no roster.

### F-166 [P3] open - Opening Schedule refetches the directory in every other tab in the organization

**File:** `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1656, 6518, 8975` (`updateScheduleLastViewed`); `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:134-135`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Writing `organization_memberships.schedule_last_viewed_at` makes the org channel invalidate `org.users` and `org.directory` everywhere that can see the row. `permissionsRealtime.ts:110-113` already ignores that column; the org channel doesn't.
**Suggested fix:** Ignore membership updates that change only `schedule_last_viewed_at`, as the permissions path does.
**Resolution:**

### F-167 [P2] open - Bulk alert actions cause a request storm on the Alerts page

**File:** `apps/web/src/hooks/useNotificationsRealtime.ts:47-57, 103-112`; `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx:322-335, 394-409`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Mark all read or a bulk archive updates N rows, so N realtime events arrive with no debounce. Per event the bell and the inbox each invalidate `notifications.all`, the inbox re-runs `refreshFacets()` per cached query, and `realtimeTick` re-runs the full search (the response is dropped, the request is not). Fifty events become roughly 50 searches and a few hundred count and facet requests.
**Suggested fix:** Debounce the shared listener fan-out (about 300ms, trailing), invalidate once per subscription, and debounce `refreshFacets`.
**Resolution:**

### F-168 [P3] open - The staff page fetches the same month twice and keeps the person outside the query cache

**File:** `apps/web/src/components/staff-detail/StaffDetailPage.tsx:285-349` (employee and recurring shifts in `useState`), `:911-933` and `:1526-1539`; `PersonMonthCalendar.tsx:101-106`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The Schedule tab loads the period's shifts and the month grid loads the padded month under its own key, the same data twice by default. The person and their recurring shifts sit in `useState`, so previous and next, and Back, repeat F-139's two-step waterfall each time, ignore the roster the People list just loaded, and get no realtime refresh.
**Suggested fix:** Serve the grid month from the period's data when it falls inside it; move the person into `useQuery` with `placeholderData` from `employees.all`.
**Resolution:**

### F-169 [P2] unverified - Every in-app navigation waits on the proxy and a function render, Back included

**File:** `apps/web/src/app/(app)/layout.tsx:47` (`force-dynamic`); `apps/web/next.config.ts:64-76` (no `experimental.staleTimes`); `apps/web/src/proxy.ts:824-826` (matcher includes RSC requests)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The page segments are client wrappers with no server data, yet each click, including Back to a visited page, goes edge proxy (verify, org memo, database) then a pdx1 render before the page swaps, with a bare `ProgressBar` meanwhile. Related to F-133 (hard loads); this is soft navigation. Latency unmeasured.
**Suggested fix:** Set `experimental.staleTimes: { dynamic: 30 }` so visited segments are reused from the router cache; measure a click before and after.
**Resolution:**

### F-170 [P3] unverified - Schedule's presence and drafts channels rejoin on any organization row change

**File:** `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:2489-2498, 2586-2593`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The effects depend on the whole `org` object, which is new after any `organizations` change (a settings save, a billing sync). Presence flickers and `draft_changed` messages sent during the rejoin are lost, since a refetch follows only an error. Also a 30s `now` tick in `useShiftRequests.ts:226` re-renders the whole Schedule page whenever a same-day request exists, on top of F-136's tick.
**Suggested fix:** Depend on `org?.id`; keep the request tick inside the components that show relative time.
**Resolution:**

### F-171 [P2] open - Publish and discard read every cell in the period, snapshots and segments included, to count three numbers, and stop silently at 1,000 rows

**File:** `apps/web/src/lib/server/schedule-draft-safety.ts:9-60`; called from `apps/web/src/app/api/shifts/publish/route.ts:88, 97` and `shifts/discard/route.ts:84`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The read is unpaged, so past PostgREST's `max_rows = 1000` (`supabase/config.toml:18`) the summary written to the audit log undercounts. The notes query loads published notes too. Discard with `scope: "all"` makes the dates optional (`discard/route.ts:26-27`), so it reads the organization's whole cell history. Publish's two pre-reads run one after the other, then the RPC scans the same range again (F-147).
**Suggested fix:** For publish, count `schedule_publish_changes` by kind for the returned history id after the RPC. For discard, join only cells with a draft snapshot and require dates. Run the two reads with `Promise.all`.
**Resolution:**

### F-172 [P2] open - The shift-request list has no limit, no paging and no index for its sort or date filter

**File:** `apps/web/src/app/api/schedule/requests/route.ts:303-378`; indexes in `supabase/migrations/001_schema.sql:1460-1466`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `select('*')` with two employee embeds, ordered by `created_at`, no limit. The History tab (`ShiftRequestBoard.tsx:195`) and the staff page (`StaffDetailPage.tsx:962`) fetch the whole history, which grows with every request ever made and stops silently at 1,000 rows. The date filter ORs `requester_shift_date` and `target_shift_date`, neither indexed, and nothing indexes `(org_id, created_at)`.
**Suggested fix:** Keyset paging with a limit, narrower columns, and an index on `shift_requests (org_id, created_at DESC)`.
**Resolution:**

### F-173 [P2] unverified - The staffed call-off trigger resolves every publish change before checking whether any pickup is waiting

**File:** `supabase/migrations/099_away_until.sql:3811-3930` (`finalize_scheduler_staffed_calloffs`, AFTER INSERT on `schedule_publish_changes`); `082` `resolve_schedule_state_storage`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Each worked change runs `resolve_schedule_state_storage` twice (several job, shift and absence-type lookups) before scanning for open pickups that day, which usually returns none. A month publish for 150 people is about 3,000 runs. Out of lens and unchecked: `resolve_schedule_state_storage` raises on a since-archived job or shift, which could fail a whole publish.
**Suggested fix:** Return early unless an open pickup with a parent exists for the org and date (`idx_shift_requests_org_open_pickups`). Check the archived-reference case separately.
**Resolution:**

### F-174 [P2] fixed - Leaving the grid locks the person's whole schedule history

**File:** `supabase/migrations/100_away_absence.sql:170-212` (`clear_schedule_for_departed_employee`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The loop selects every cell for the person with no lower date bound and `FOR UPDATE`, one row per day of tenure per status change, multiplied by bulk changes of up to 100 people. Past days need work only when they hold a draft. The in-progress fix (migration 113) copies this body and adds publish work to the same loop.
**Suggested fix:** Add `AND (c.date >= v_today OR EXISTS (a draft snapshot))` before `FOR UPDATE`; fold it into 113 while that migration is unreleased.
**Resolution:** Fixed on fix/leaving-grid-publishes-removals (2026-11-02): migration 114 adds the lower bound before `FOR UPDATE`, so a past day is locked only when it holds a draft or has nothing published; the integration test checks a past draft is still cleared and a past published day kept.

### F-175 [P3] open - Bulk status changes run one person at a time with no time limit

**File:** `apps/web/src/app/api/employees/status/bulk/route.ts:132`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Up to 100 people go through `applyStatusChange` in sequence, each several round trips plus F-174's trigger and the away-absence fill. No route sets `maxDuration`.
**Suggested fix:** Bounded concurrency (keep Super Admin offboards serial for the last-Super-Admin check) and a `maxDuration`.
**Resolution:**

### F-176 [P2] open - The hidden-people filter scans every profile on the platform, unindexed, before most schedule and people reads

**File:** `packages/data-access/src/internal-people.ts:17-23`, then `:37-50`; for example `apps/web/src/app/api/schedule/manage/route.ts:1134`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `profiles where is_internal = true` has no index, so it reads every user across every organization, serially before `fetchHiddenEmployeeIds`, on about 40 call sites. It grows with the platform, not the organization.
**Suggested fix:** A partial index on `profiles (id) WHERE is_internal`, plus a 30s in-process memo, since the list is platform-wide.
**Resolution:**

### F-177 [P2] fixed - Schedule audit rows are fire-and-forget, like F-145's alerts

**File:** `apps/web/src/app/api/schedule/manage/route.ts:57` (`logScheduleAudit`, 13 calls); `apps/web/src/app/api/schedule/recurring/route.ts:21` (4 calls)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `void serviceClient.from("audit_log").insert(...)` after the response may be cut off on Vercel, dropping the activity log's Before and After. It also means F-145's suggested check (alerts against audit rows) can't confirm schedule actions.
**Suggested fix:** Wrap in `after()`.
**Resolution:** Fixed on fix/alerts-finish-after-response (2026-11-02): `logScheduleAudit` in `schedule/manage` and `schedule/recurring` writes inside `after()` and still only logs a failed write; the same lint rule covers it.

### F-178 [P3] open - Gridmaster oversight reads whole platform tables with unordered offset paging

**File:** `apps/web/src/app/api/gridmaster/_lib/oversight.ts:220-301, 782-799`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Memberships, employees, invitations, every shift request and every session are read on each load, memoized per isolate. `selectAllPages` pages by offset with no ORDER BY, so rows can be skipped or repeated. The 30-day `schedule_cells` read is unpaged (stops at 1,000) with no `created_at` index.
**Suggested fix:** Aggregate in SQL views or RPCs; if paging stays, order by id.
**Resolution:**

### F-179 [P3] unverified - Realtime publishes 29 tables, most with `REPLICA IDENTITY FULL`

**File:** `supabase/migrations/001_schema.sql:1604-1632`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Includes `audit_log`, `user_sessions`, `notifications`, `profiles` and every schedule table. Each update or delete writes the full old row to the WAL, and Realtime re-checks access per subscriber, compounding F-141, F-150 and F-163. Also, the web org channel registers 24 bindings per tab and each tab opens three more per-user channels (`perms:m`, `perms:e`, `account-freshness`) that could be one.
**Suggested fix:** Remove tables no client subscribes to from the publication, use default replica identity where old values aren't read, and merge the per-user channels.
**Resolution:**

### F-180 [P3] open - Smaller schedule read costs

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1140-1176`; `apps/web/src/lib/server/schedule-context.ts:20-37`; `CacheKey.employees` in `apps/web/src/lib/cache.ts`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:**

- `fetchShifts` loads draft snapshots for viewers who can't edit, then redacts them.
- `fetchAssignmentContext` makes three uncached queries on every schedule read and echoed save, though cached versions exist in `lib/db/config.ts`.
- `CacheKey.employees` is invalidated in about 15 places and read nowhere.

**Suggested fix:** Skip the draft embed when `!canEditShifts`, use the cached config reads, and delete the unused key's invalidations.
**Resolution:**

### F-181 [P2] fixed - The mobile app keeps no data between launches, so every cold open waits on a token refresh and bootstrap before anything shows

**File:** `apps/mobile/src/shared/lib/query-client.ts:33-44` (no persister; none in `apps/mobile/package.json`); `apps/mobile/src/shared/components/StartupSplashGate.tsx:57-106`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** With `jwt_expiry = 3600`, most cold opens start with an expired token. The splash holds through the refresh (GoTrue plus the access-token hook, then a SecureStore write of the over-2KB session), then `GET /bootstrap`, and only then starts the Home queries, so Home shows a skeleton for a further round trip. Nothing from the last session is shown meanwhile. This is the largest single cause of the slow cold open the owner reports. The size of the gain is unmeasured. P2 rather than P1: it is a missing optimization, not a defect, and must not block unrelated work at `/complete`.
**Suggested fix:** Persist the bootstrap and Home query keys (`@tanstack/query-async-storage-persister` or MMKV), keyed by user and org and cleared on sign-out, and lift the splash on the restored bootstrap while the network refreshes behind it.
**Resolution:** Fixed on fix/mobile-persisted-cache-v2 (2026-10-31), once the Dependency Audit gate was green (#234): `@react-native-async-storage/async-storage` 2.2.0 and the TanStack async-storage persister 5.101.4 (pinned to the installed React Query) keep the bootstrap and Home's queries for 24 hours, keyed to the app version, and remove them wherever the cache clears (sign-out, identity change, organization switch). Tested in `query-persistence.test.ts`. Needs a new development build before it shows on a device; not measured on one.

### F-182 [P2] fixed - The mobile login response doesn't carry the bootstrap, so sign-in pays one more round trip and auth wave

**File:** `apps/web/src/features/mobile/server/routes/auth-login.ts:211`; `apps/mobile` `LoginScreen.tsx:266-295`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The login handler already holds the user, memberships and organization, but the app then calls `/bootstrap` (a full mobile auth wave on the server), awaits it, then prefetches Home, then navigates. Three serial client round trips without MFA. About 300-800ms on cellular, unmeasured.
**Suggested fix:** Return the bootstrap payload with the login response and seed the query cache, so the Home prefetch starts as soon as login returns.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the login handler builds the bootstrap with the new token (shared auth memo, bounded to 3s and well inside the login deadline) and sends it as an optional field; `LoginScreen` seeds it and starts Home's queries at once. Older builds ignore the field. Not measured on a device.

### F-183 [P2] fixed - The bootstrap request can't start until fonts, the theme read and the first render finish

**File:** `apps/mobile/app/_layout.tsx:49, 243-252`; `apps/mobile/src/shared/providers/ThemeModeProvider.tsx:61, 93`; `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:95, 223`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The root renders nothing until five fonts load; `ThemeModeProvider` then reads SecureStore and returns null until it lands (500ms fallback); only then does `AuthSessionProvider` mount, call `getSession` and start bootstrap. `warmSupabaseSession()` already runs at module scope but nothing chains the bootstrap onto it. The 900ms minimum splash also counts only from the gate's mount (`StartupSplashGate.tsx:17`). Refines F-153.
**Suggested fix:** At module scope, chain the warmed session into `queryClient.prefetchQuery(createBootstrapQueryOptions(token))` and start the theme read there too; count the minimum splash from launch.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): `warmStartup()` at module load starts the bootstrap for the stored session and the theme read, and the minimum splash counts from launch. Not measured on a device.

### F-184 [P2] fixed - Every mobile API call repeats serial auth work

**File:** `apps/web/src/features/mobile/server/auth.ts:37` (feature flag awaited before verification); `apps/web/src/lib/auth/verify-token.ts:164` (remote JWKS, F-158); `packages/mobile-api-core/src/setup.ts` (`isMobileOrgSetupComplete`, 7 queries, no in-flight dedupe); `packages/mobile-api-core/src/auth.ts`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Each request awaits the flag, then verifies, then runs about eight parallel reads including a GoTrue `getUser`, plus the 7 setup queries on a cold instance; the 3-5 calls a cold start fires concurrently each run them. Then the handler's own waves follow.
**Suggested fix:** Start the flag lookup alongside verification, dedupe the setup check in flight, and memo the resolved auth context per token hash for a few seconds, as `isSessionRevoked` already does.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the `mobile_api` flag is read alongside auth, one resolution per token is shared for 5 seconds (refusals are not remembered), and concurrent setup checks share one read.

### F-185 [P2] fixed - Mobile startup handlers run independent database reads in series

**File:** `apps/web/src/features/mobile/server/data.ts:953-971` (`fetchMobileScheduleEntries`); `read.ts:466` and `packages/mobile-api-core/src/shift-requests.ts:330` (`fetchLinkedEmployeeForUser`); `apps/web/src/features/mobile/server/routes/dashboard.ts:79-116` (`hiddenUserIds()`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The comparison-rows query waits for six reference reads it doesn't use; the linked-employee read repeats a row auth already loaded; the hidden-people lookup (F-176's unindexed scan) gates every dashboard and shift-request fetcher. One to three extra database round trips on each of the calls Home needs.
**Suggested fix:** Move the independent reads into `Promise.all`, widen the auth employee select and reuse it, and start the hidden-people lookup in the auth wave with a memo.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the comparison rows load with the reference reads, and the internal-account list is kept for 30 seconds per process. The linked-employee read stays serial: which requests a person sees depends on it.

### F-186 [P3] open - Mobile two-factor sign-in makes two or three redundant round trips

**File:** `apps/mobile/src/shared/lib/api.ts:781-801` (`verifyMobileTotpFactor`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** An ephemeral `setSession` (a `getUser`), challenge, verify, then a refresh, then the main client's `setSession` calls `getUser` again: seven serial client round trips for a two-factor sign-in.
**Suggested fix:** Send challenge and verify with the bearer token directly; drop the refresh if the verified token already carries the hook claims (check this first).
**Resolution:**

### F-187 [P3] unverified - The mobile session is re-read from SecureStore on every `getSession`, including each realtime heartbeat

**File:** `apps/mobile/src/shared/lib/local-storage.ts:32`; `apps/mobile/src/shared/lib/supabase.ts:28-31`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** auth-js re-reads storage on each `getSession`: about five reads of the over-2KB value at launch (initialize, warm, provider, auto-refresh, realtime connect), then one per 25s heartbeat. The comment claiming the work is shared is inaccurate. Cost on the Android keystore unmeasured. Related to F-128.
**Suggested fix:** An in-memory read-through cache in `local-storage.ts`, written through on set and remove.
**Resolution:**

### F-188 [P3] open - Smaller mobile startup and sign-in costs

**File:** `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:141-159` and `apps/web/src/features/mobile/server/routes/session-presence.ts:70-115`; `apps/web/src/features/mobile/server/routes/auth-login.ts` (org lookup, `start_trial_for_org`); `apps/mobile` `LoginScreen.tsx:163-188, 341`; `apps/mobile` `prefetch-home.ts:51-61`; `apps/mobile/app.json` (`expo-font` with no `fonts` list)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:**

- Session presence posts on every launch beside bootstrap (its mark is in memory only), with four serial server steps.
- The login handler looks up the org after the rate limit instead of alongside it, and awaits `start_trial_for_org` on every Super Admin login.
- Sign in stays disabled until the remembered-org lookup answers, so an autofilled submit waits on a cold function.
- Staff shiftmates (`/org/schedule`) aren't prefetched, so they pop in after Home.
- Fonts load at runtime rather than being embedded.

**Suggested fix:** Defer presence until the splash lifts and persist its mark; overlap the org lookup and run the trial start in `after()`; allow submit while the org confirms; prefetch `/org/schedule` when the person can view it; embed the fonts through the `expo-font` plugin.
**Resolution:**

### F-189 [P2] open - zod 3 can exhaust memory validating an oversized constrained collection, and the fix is zod 4

**File:** `package.json`, `apps/web/package.json`, `packages/contracts/package.json` (`zod` 3.24.4); 104 files import it in `apps/web/src` and `packages/contracts/src`; `scripts/audit-check.mjs` allowlist
**Found:** 2026-10-31 while clearing the Dependency Audit gate (fix/dependency-audit-gate)
**Why it matters:** GHSA-mrhx-c7xc-m3w5 (high): a huge array posted against a schema with a length or size constraint walks every element before the constraint fails, so request validation in the web routes and the mobile API can be pushed into memory exhaustion. Vercel caps a request body at 4.5 MB, which bounds what one request supplies. Fixed only in zod 4.6.6.
**Suggested fix:** Upgrade to zod 4 across web, mobile and the packages in one change (Dependabot #190 has the version bump; the schema API changes need the code), keeping one zod copy so `instanceof` checks hold (see the identical-specifier note). The allowlist entry holds until 2026-12-01.
**Resolution:**

### F-190 [P0] fixed - One organization's settings save can take over another organization's absence types and schedule note types

**File:** `apps/web/src/app/api/settings/config/route.ts:2775` (`upsertAbsenceType`), `:2872` (`upsertIndicatorType`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Both updates run on the service client with `.update(row).eq("id", id)` and no `org_id` filter, and `row.org_id` is the caller's organization. The ids are `BIGINT IDENTITY`, so they can be counted through. An Admin with `canManageScheduleDefinitions` or `canManageIndicatorTypes` in org A sends another organization's id: that row is rewritten and moved to org A. Reproduced at the database on a throwaway stack at migration 120 with a service-role update: org B dropped from 11 to 10 absence types and 173 of its schedule snapshots then pointed at a type owned by org A. Nothing stops it: no trigger guards `org_id`, and the foreign keys are single-column. Every other upsert in this route filters on `org_id`. The HTTP route itself was traced, not run.
**Suggested fix:** Add `.eq("org_id", effectiveOrgId)` to both updates and answer 404 on no row. Add a route test that a foreign id is refused. F-192's `org_id` immutability trigger is the backstop.
**Resolution:** Fixed on fix/tenant-write-guards (2026-11-06): both updates now filter on the effective organization and answer 404 when no row matches. Route tests send a foreign id and fail on the old code. The route was tested with a client double, not run against a live database.

### F-191 [P0] fixed - A manager can rename any account on the platform through a client-supplied `userId`

**File:** `apps/web/src/app/api/employees/identity/route.ts:158`; `apps/web/src/app/api/employees/manage/route.ts:917` (`syncLinkedProfileName(nextEmployee.userId)`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Both routes authorize on the caller's organization and load the employee row with an org filter, then update `profiles` with the service client using the `userId` from the request body, never comparing it to that row's `user_id`. A manager in org A sends one of their own employee ids plus any other person's user id, and that person's name changes everywhere they appear, in any organization, Gridmasters included. The precondition is the victim's UUID: not enumerable, but known for anyone who has shared or left an organization, since it stays in that organization's audit rows. Traced, not run.
**Suggested fix:** Use the stored row's `user_id` (`currentEmployee.userId`, `previousRow.userId`), and drop `userId` from the request schema for this purpose.
**Resolution:** Fixed on fix/tenant-write-guards (2026-11-06): `employees/identity` no longer accepts `userId` and renames only the stored row's account. `employees/manage` loads the stored row first and uses its account for the rename and the management-access check, so a client value is overwritten. Route tests send another account's id and fail on the old code. Client doubles, not a live run.

### F-192 [P1] open - The database lets one organization's rows point at another organization's rows

**File:** `supabase/migrations` (33 foreign keys between tenant tables are single-column; only `schedule_cell_snapshots_cell_org_fkey` and `schedule_cell_segments_snapshot_org_fkey` carry `org_id`); `write_schedule_cell_snapshot_internal`; `schedule_cells_emp_id_date_key`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `org_id` is present and RLS-checked on the row itself, but nothing ties the row's links to the same organization. Run as org A's Super Admin on a throwaway stack at 120, all of these were accepted: a schedule cell for org B's employee, a cell with org B's focus area, a recurring shift and a shift series for org B's employee, a coverage requirement with org B's focus area and job, a shift with org B's focus area, and a profile change request naming org B's employee. `write_schedule_cell_snapshot` also accepted org B's shift, job and absence ids on an org A cell; `schedule_cell_segments.shift_id` and `job_id` have no foreign key at all. The effect is real: with a cell planted for org B's employee, org B's own save for that person and date failed on `schedule_cells_emp_id_date_key`, because that unique index omits `org_id`. It needs the employee's UUID. A plain staff member can also insert a change request naming a coworker's employee id. Approval filters by org, so the foreign case fails safely, but the same-org case changes the coworker. No read leak was found through these links. The department id checks in `validate_department_ids` confirm existence, not organization.
**Suggested fix:** A forward migration in stages: add `UNIQUE (org_id, id)` on each parent, then composite foreign keys `(org_id, x_id)` for the 33 links, `NOT VALID` first and validated after a data check; add `org_id` to `schedule_cells`' unique index; add a shared trigger refusing a change to `org_id`; validate shift, job and absence ids in the cell write functions; bind `requester_employee_id` to the requester in the insert policy.
**Resolution:**

### F-193 [P1] open - Editing a pending invitation's email keeps its token, so an Admin can create a confirmed account at someone else's address

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:391` (PATCH changes `email`, not `token`); `apps/web/src/app/api/invitations/register/route.ts:129` (`email_confirm: true`), `:167`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The token is treated as proof of the inbox, but PATCH moves it to a new address. An Admin invites their own mailbox, reads the token, changes the email to `victim@otherhospital.org`, and registers with that token and a chosen password. The result is a confirmed account at the victim's address with a password the attacker knows. If another organization later invites that person, the invitation finds it as an existing account, and the attacker's live session can then follow them into that organization. If an unconfirmed account with no memberships already holds the address, its password is overwritten instead. Traced, not run.
**Suggested fix:** Rotate the token (and resend) whenever the email changes, using `replace_pending_invitation_access`, and refuse a register whose token predates the email change.
**Resolution:**

### F-194 [P1] open - API requests aren't bound to the session's organization, so a person suspended in one organization keeps access to it through another

**File:** `apps/web/src/app/api/shared/permissions.ts:471` (`requireOrgPermissions`), `apps/web/src/app/api/employees/shared.ts` (`canManageEmployees`); `apps/web/src/proxy.ts:825` (the matcher excludes `/api`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The API authorizes on the client-supplied `orgId` plus a live membership, and never compares it to the token's `org_id` or the host. Suspension leaves the membership live and only sets `employees.suspended_at`, which the token hook checks for the session's active organization and these helpers never read. Someone suspended in org A who also belongs to org B signs in to B and posts `orgId: A`: service-client routes accept it, including schedule and staff management. Non-members are still refused, so this is limited to people with memberships in both. Per-session organization isolation holds on pages and RLS, not in `/api`. Mobile is safe because it uses only the token's org. Traced, not run.
**Suggested fix:** Refuse in `requireOrgPermissions` and `canManageEmployees` when `orgId` differs from the verified token's org (Gridmaster impersonation and the sandbox excepted), and read the employee's suspension there. Also refuse a failed `endUserSessions` rather than only logging it.
**Resolution:** Fixed on fix/api-bound-to-session-org (2026-11-06): `requireOrgPermissions`, `canManageEmployees` and the role-change route refuse a request for an organization other than the session's, and anyone suspended from the organization asked for, so a live token is cut off even when ending its session failed. A Gridmaster is exempt, a sandbox counts as the session's organization, and a token naming no organization falls back to the membership check, since it can reach only an organization where the person holds a live, unsuspended membership. A failed `endUserSessions` is still only logged, because the suspension check now covers what it left open. Unit tests with client doubles; E2E exercises the real routes in CI.

### F-195 [P1] open - Acting on a request from another organization's session alerts the wrong organization

**File:** `packages/mobile-api-core/src/shift-requests.ts:500`, `:570` (dispatch with `auth.currentOrg.id`); `respond_to_shift_request_unguarded`, `claim_shift_request_unguarded`, `cancel_shift_request_unguarded` (check `employees.user_id = auth.uid()`, no org); `apps/web/src/features/notifications/server/events.ts:249` (`getRequestInfo` reads the request unscoped)
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Someone employed in orgs A and B, on a B session, sends `PATCH /shift-requests/<A request>`. The function changes A's request, then the route dispatches under B, so B's approvers get an alert carrying A's staff names and A's approvers get nothing. It needs dual employment. Function bodies were read; the dispatch was traced, not run.
**Suggested fix:** Require `shift_request_org_id(p_request_id) = caller_org_id()` in the three functions, and dispatch with the request's own `org_id`.
**Resolution:**

### F-196 [P1] open - Managers and staff can look up accounts across every organization by email

**File:** `apps/web/src/app/api/users/check-email/route.ts` (`exists`, `displayName`); `apps/web/src/features/employees/server/contact-conflicts.ts:113`, `:211`; `apps/web/src/app/api/employees/check-email/route.ts`; `account/profile/contact-check`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `users/check-email` gives anyone with `canManageEmployees` whether an address has a DubGrid account anywhere, with that person's name, for the Add-Employee preview. `employees/check-email` returns `reason: "gridmaster"`, identifying platform staff, and a client-chosen `currentUserId` turns it into an account-exists check. `account/profile/contact-check` answers `emailTaken` for any address to any signed-in staff member. Limited per user only. A competitor or a former employee in another organization can test who works where. Read in code; `users/check-email`'s name return is documented behaviour, so this is a product decision as well as a defect.
**Suggested fix:** Return no name for a person outside the caller's organization, answer the same generic "they'll get an invite" for any address not in this organization, drop `currentUserId` from the client (use the row's own `user_id`), and never distinguish a Gridmaster.
**Update 2026-11-06:** the owner approved the wording of two emails for the strict approach. An invitation to an address with an account keeps the current invite and replaces "set your password" with "You already have a DubGrid account with this email address, so there's nothing to set up. Sign in with your password to accept." A new notice, "Someone tried to use your email address", goes to the owner of a taken address, at most once a day per address, and names no person, organization or other address. Still to do before building: test how Supabase answers a change to a taken address, and give the Gridmaster save error a generic refusal. Removing the inline taken-email error from My profile (#367) has not been separately confirmed.
**Resolution:**

### F-197 [P1] open - An Admin who can only edit shifts can rewrite the published schedule directly, unlogged

**File:** `supabase/migrations` policies `admin_write_schedule_cells`, `admin_write_schedule_cell_snapshots`, `admin_write_schedule_cell_segments` (FOR ALL on `canEditShifts`, any `snapshot_kind`)
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** Run on the throwaway stack as an Admin with `canEditShifts` and no publish permission: `publish_schedule` refused, but deleting a published snapshot's segments and updating a published snapshot directly both succeeded. A browser session can do the same through PostgREST, bypassing publish, past-day locks, corrections, the snapshot history and the audit log. This is inside one organization, not cross-tenant. By a grep of direct `.from(...)` writes in web and mobile, the only browser write to these tables is `deleteShiftSeries` clearing `series_id` (`apps/web/src/lib/db/schedule.ts:499`); the rest go through server functions.
**Suggested fix:** Move that one write into `delete_shift_series`, then revoke INSERT, UPDATE and DELETE on the three tables from `authenticated` and leave writes to the SECURITY DEFINER functions. Review the same for other tables written only by the server.
**Resolution:**

### F-198 [P1] open - Any Admin can give themselves Super Admin over a copy of all staff records, and keep it after being demoted

**File:** `apps/web/src/app/api/test-sandbox/route.ts:132`; `apps/web/src/features/test-sandbox/server.ts:41` (`select("*")`, no archived filter), `:304`; `switch_org`, `get_my_organizations`; `apps/web/src/app/api/shared/permissions.ts:425`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** The route checks `org_role` only, not `admin_permissions`, and has no feature flag. An Admin with only `canEditShifts` enters the sandbox, becomes `super_admin` there, and reads every cloned person's email, phone and contact notes, offboarded people included, for example through `GET /api/export?type=staff`, which the sandbox redirect serves. `switch_org` has no `workspace_kind` filter or session binding, and nothing re-checks the source role, so a demoted Admin keeps the clone for up to 14 days. Mobile sign-in doesn't clear sandboxes as web sign-in does. Traced, not run. Stays inside one organization's data; sandbox isolation between organizations held.
**Suggested fix:** Require `canViewStaff` and `canManageEmployees` (or restrict to Super Admins), clone only what a tester needs or mask contact fields, exclude archived staff, re-check the source role on every sandbox request, and exclude sandboxes from `switch_org` and `get_my_organizations`.
**Resolution:**

### F-199 [P2] open - Realtime sends every signed-in user the ids of rows deleted in other organizations

**File:** `supabase/migrations/001_schema.sql:1604` (the `supabase_realtime` publication, 29 tables); `apps/web/src/hooks/useOrgRealtimeInvalidation.ts`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Confirmed live on the throwaway stack: a staff user of org A, subscribed to `schedule_cells` with no filter, received `{"id": ...}` for a row deleted in org B; an UPDATE in org B correctly did not arrive. Postgres Changes cannot apply RLS or filters to DELETE. Only primary keys travel, so the leak is ids, timing and volume, but ids of deleted memberships and profiles are person identifiers.
**Suggested fix:** Move invalidation to Broadcast from the database (`realtime.broadcast_changes`) on the private per-organization channels already in use, then remove these tables from the publication. Until then remove tables no client subscribes to, and check the dashboard's "Allow public access" Realtime setting is off.
**Resolution:**

### F-200 [P2] open - Super Admins can change write-once organization fields directly, including the subdomain

**File:** column UPDATE grants on `organizations` to `authenticated` (`slug`, `feature_overrides`, `employee_count`, `data_retention_days`, among others); `admin_update_organization`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Confirmed on the throwaway stack: an org A Super Admin updated their own `slug`, `feature_overrides` and `employee_count` through the table. I found no customer path that changes `slug`, which the app treats as permanent. Changing it frees the old subdomain, which another organization's Super Admin can then claim the same way, serving their sign-in page at a name the first organization's staff trust. Taking a name in use and the reserved names were refused.
**Suggested fix:** Revoke UPDATE on `slug`, `employee_count` and any Gridmaster-owned field, or all columns and route writes through `organizations/settings`.
**Resolution:**

### F-201 [P2] open - Gridmaster writes don't always need an impersonation, and starting one doesn't always leave an audit row

**File:** `apps/web/src/app/api/employees/manage`, `organizations/settings`, `import/employees`, `shifts/discard`, `employees/status`, `employees/identity` (none set `gridmasterNeedsImpersonation`); `start_impersonation` (migration 057)
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** F-75's rule binds a Gridmaster's organization writes to an active impersonation, but only schedule, requests, recurring, publish and settings/config apply it. A stale or stolen Gridmaster token can edit staff, organization settings or drafts in any organization with no notice to it, and `shifts/discard` uses direct service-role writes that migration 075 doesn't cover. `start_impersonation` writes no `audit_log` row itself: the route does, after the RPC, so a direct call with a fresh-proof token skips it and the notice email (`impersonation_sessions` still records it). The API role stays `gridmaster` while impersonating, so an impersonator isn't limited to the target's rights. Read in code.
**Suggested fix:** Make the impersonation requirement the default for any Gridmaster write in `requireOrgPermissions`, with named exceptions, and apply it in `canManageEmployees`. Write the audit row inside `start_impersonation`, as migration 071 does elsewhere.
**Resolution:**

### F-202 [P2] open - The server code has no enforced tenant boundary: 196 files can reach the service client

**File:** `apps/web/src/lib` and every route using `serviceClient`; `eslint-rules/`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** RLS is the boundary for browser reads, but most server work uses the service client, which bypasses it, so each query depends on someone remembering `.eq("org_id", ...)`. F-190 is exactly that miss, in 2 of 21 updates in one file, and earlier audits found the same class (F-8 to F-16, 2026-07). `org-isolation.integration.test.ts` is good but tests policies, not routes, and no check covers a foreign id sent to a route.
**Suggested fix:** Add a tenant-scoped helper (`orgDb(orgId).from(table)` that applies the filter), a lint rule refusing a bare `.eq("id", ...)` on a tenant table in a mutation, and a generated CI test that signs in as org A and sends org B's ids to every mutation route. Turn the probes from this audit into a live test over every table in the inventory.
**Resolution:**

### F-203 [P2] open - Deleted organizations' data is kept indefinitely and the retention jobs never run

**File:** `purge_expired_data`, `purge_scheduled_accounts`, `flag_inactive_accounts` (no caller in `apps/`, `packages/`, `.github/` or `apps/web/vercel.json`, no `pg_cron`); `apps/web/src/app/api/organizations/delete/route.ts:107`; `apps/web/src/app/privacy/page.tsx:308`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Organization delete is a soft archive, `purge_expired_data` skips archived organizations, and nothing hard-deletes them, so staff data outlives the customer. The Privacy Policy promises configurable retention, and the open question on self-serve data export is still unanswered. A Supabase dashboard schedule wouldn't show in the repo, so check that first.
**Suggested fix:** Schedule the jobs, define a hard-delete window after archive with a verified per-organization export before it, and align the policy text.
**Resolution:**

### F-204 [P2] open - Auth cookies are readable by script, and sign-in pages allow inline scripts

**File:** `apps/web/src/lib/auth/session-cookies.ts`, `apps/web/src/lib/supabase.ts`, `apps/web/src/proxy.ts:261` (public pages keep `'unsafe-inline'`), `supabase/config.toml:292`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** No `cookieOptions` are set, so `@supabase/ssr` defaults apply: not HttpOnly, with a 400-day life, which the browser client needs in order to read them. `/login`, `/accept-invite` and `/reset-password` run under `script-src 'unsafe-inline'` though they render dynamically, so an XSS there reads refresh tokens. There is no server-side session time limit; the web idle timeout is client-side only. `connect-src https://*.supabase.co` allows sending data to any Supabase project. Cookies are host-only, which is correct for subdomains. The flag behaviour is from the library's defaults, not observed in production.
**Suggested fix:** Use the nonce CSP on those pages, set Secure and SameSite explicitly, set Supabase's session time-box and inactivity timeout, and narrow `connect-src` to the project host. Moving tokens out of script reach is a larger decision.
**Resolution:**

### F-205 [P2] open - Mobile access and data outlast a session

**File:** `apps/mobile/src/shared/lib/auth-reset.ts:28`; `apps/mobile/src/features/profile/screens/ProfileScreen.tsx:194`; `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:116`; `apps/mobile/src/shared/lib/query-persistence.ts:22`; `packages/mobile-api-core/src/auth.ts`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:**

- Push disable is client-only and needs a live token, so a remote sign-out or forced teardown leaves the phone receiving the organization's alerts, with coworker names on the lock screen, until the next sign-in. No revoke path touches `mobile_device_tokens`.
- A session that died while the app was closed never crosses the cache-clear boundary, so team schedules stay in plain AsyncStorage for up to 24 hours. They don't render for another user: keys carry user and org.
- Mobile auth never reads `deactivated_at`, `terminated_at` or `suspended_at`, relying on the Redis marker (which fails open) and `auth.getUser`, while web checks the first two.

Traced, not run on a device. Whether `allowBackup` carries the cache into device backups is unchecked.
**Suggested fix:** Delete `mobile_device_tokens` rows server-side wherever sessions are ended, clear the cache at cold start when the session restores empty, and check account state in mobile auth as web does.
**Resolution:**

### F-206 [P2] open - The mobile API shows staff more than the organization's settings allow

**File:** `apps/web/src/features/mobile/server/routes/shift-swap-options.ts:207`; `packages/mobile-api-core/src/read.ts:574`; `apps/web/src/features/mobile/server/routes/person.ts:174`; `apps/web/src/features/mobile/server/data.ts:1356`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** Inside one organization: swap options return entries without `withScheduleVisibility`, so item 46f's hidden publisher and change details reach staff. `/people` and `/people/[id]` leave a coworker's suspension, planned status and dates, first day, `orgRole` and `adminPermissions` in the response, and the detail route has no internal-account filter. Staff open shifts are computed from draft rows, so unpublished edits can be inferred. Traced, not run.
**Suggested fix:** Apply the visibility helper to swap options, build the staff response from an allowed-fields list rather than a strip list, and use published rows for anyone who can't edit.
**Resolution:**

### F-207 [P2] open - Telemetry sends staff emails to third parties and can't be tied to an organization

**File:** `apps/web/src/components/AuthProvider.tsx:100`; `apps/web/src/components/PostHogProvider.tsx:44`; `apps/web/src/lib/sentry.ts:260`; `apps/web/sentry.server.config.ts`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `setSentryUser` sends the email with no consent gate, despite `sendDefaultPii: false`. `orgId` is never passed, so the `org_id` tag is never set and one customer's events can't be found or removed. PostHog identifies by email (consent-gated) with no organization group. The server config has no `beforeSend`, and `redactSecurityValue` removes secrets, not names or emails.
**Suggested fix:** Send the user id only, set the `org_id` tag, add a server `beforeSend` that drops bodies and emails, and identify in PostHog by id with an organization group.
**Resolution:**

### F-208 [P2] open - One attacker can trip the shared login limit for every organization

**File:** `apps/web/src/app/api/auth/login/route.ts:413`; `apps/web/src/lib/rate-limit.ts:134`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The email, IP and `login:global` limiters run together in `Promise.all`, so a request the IP limiter refuses may still count against the global 500 per 10 seconds, which is about 50 requests a second from one address. Mobile shares the key, and recovery has the same shape at 100 per 10 seconds. Upstash's counting wasn't run, so this needs a test.
**Suggested fix:** Check the IP limiter first and only then consume the global one.
**Resolution:**

### F-209 [P3] open - Smaller multi-tenancy gaps

**File:** see each item
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:**

- `create_shift_request_unguarded` and `change_user_role` look up idempotency keys across all organizations, so a reused key returns or skips on another organization's row. Keys are client UUIDs, so a collision is unlikely.
- `status-change.ts:711`, `offboard-access.ts:32` and `organizations/access/route.ts:520` end a shared person's sessions in every organization. The code says deliberate, and `endAccessInOrganization` already scopes this for Move email.
- `sender.ts:226` throttles email per user with no organization, so a busy org A can stop org B's emails to a shared person.
- `calendar-subscription.ts:57` keeps serving a Suspended person's feed.
- `auth/data-export/route.ts:54` includes former organizations' draft snapshots.
- `cron/expire-requests` alerts staff of archived organizations.
- `admin_profiles_update` lets one organization's admin rename someone whose active organization it is, though the profile is global.
- `recovery-request.ts:88` builds reset links from the request origin, `/api/validate-domain` reveals names by slug, and the reserved slug list omits `auth`, `mail`, `docs` and `support`.
- `audit_log.org_id` and `job_shift_overrides.org_id` have no foreign key (intended for the audit log, so it survives an organization), and `notifications`, `calendar_feed_tokens` and `billing_invoice_events` have no index leading on `org_id`.
- `graphql_public` is exposed though the app doesn't use it.

**Suggested fix:** Fix alongside the larger findings; scope the idempotency lookups and the email throttle by organization first.
**Resolution:**
