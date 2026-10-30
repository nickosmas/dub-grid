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
**Resolution:** Fixed on fix/password-change-fresh-session, the owner's call being "pick the best decision" (2026-09-28): turn it on safely. A signed-in change (web and mobile) always signs in again first, with the current password and, for a two-factor account, its code, which the server answers on the new session. So every change runs on a brand-new session that `secure_password_change` accepts. Route and component tests cover the right, wrong and missing code, and the old code fails them. Still to do: turn the setting on in production once this code is released.

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

### F-123 [P3] open - Metro's image-size copies stay vulnerable until the Expo SDK upgrade

**File:** `package-lock.json` (`apps/mobile/node_modules/expo/node_modules/@expo/metro/node_modules/metro/node_modules/image-size`, and the copy under `react-native > @react-native/community-cli-plugin > metro`); Dependabot alerts 193, 194
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** image-size 1.2.1 loops forever on a crafted ICNS, JXL or HEIF file (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq). Metro uses it only to measure the app's own image assets during a bundle, so the exposure is a stalled build on a developer machine or in CI, not the shipped app or the web server. The fixed 2.0.3 is a major that measures only a buffer, while Metro 0.83.3 passes a file path, so an override would break every image asset; `@expo/metro` 54.2.0 pins metro 0.83.3 exactly, and metro 0.83.8, which drops image-size, is not taken by SDK 54. Moving only the React Native copy to 0.83.8 would leave the alert open through Expo's copy.
**Suggested fix:** Take the next Expo SDK (its `@expo/metro` moves to metro 0.84), then drop the image-size entry from `scripts/audit-check.mjs`. Until then the allowlist entry holds, review by 2026-11-01.
**Resolution:**

### F-124 [P3] open - No upstream path clears decode-uri-component 0.2.2 in the mobile app

**File:** `package-lock.json` (`query-string` 7.1.3 under `expo-router` and `@react-navigation/native > @react-navigation/core`); Dependabot alert 174
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** decode-uri-component 0.2.2 decodes malformed percent-encoded input exponentially (fixed in 0.5.0). It ships in the mobile app, where it parses the app's own deep links, so the only trigger is a crafted link opened on the user's own device, which stalls that app. query-string 7 `require()`s it as CommonJS, and 0.5.0 is ESM-only, so an override would break link parsing; even the newest expo-router (57.x) still depends on query-string ^7.1.3.
**Suggested fix:** Revisit when expo-router and React Navigation move to query-string 9.5 or later (which depends on decode-uri-component ^0.5.0), normally with an Expo SDK upgrade. Medium severity, below the `deps:audit` gate, so no allowlist entry is needed.
**Resolution:**

### F-125 [P3] open - Vitest's mocker advisory needs the Vitest 4 major

**File:** `package.json` (`vitest` ^3.2.7, `@vitest/coverage-v8` ^3.2.7) and each workspace's Vitest config; Dependabot alerts 185, 186
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** `@vitest/mocker`'s redirect mock can read files outside the project (path traversal), fixed only in 4.1.11; every 3.x release is in range. Vitest runs only on developer machines and in CI over this repo's own tests, so the exposure is a crafted test or mock path in a change we review.
**Suggested fix:** Upgrade `vitest` and `@vitest/coverage-v8` to 4.1.11 or later in one change across web, mobile and the packages, following Vitest's 4.0 migration notes, and run every workspace's suite. Medium severity, below the `deps:audit` gate.
**Update 2026-10-13:** two critical tinypool advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr, prototype-pollution gadgets reaching code execution through worker options) now put Vitest 3 above the gate. tinypool 2.1.2 fixes them and Vitest 3 cannot take it. All three are allowlisted in `scripts/audit-check.mjs` until 2026-11-15 (fix/dependency-audit); do the upgrade (Vitest 5.0.4 is current) before then rather than re-dating the entry.
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
**Resolution:**

### F-128 [P3] open - The mobile session is stored in one SecureStore value over its 2,048-byte guidance

**File:** `apps/mobile/src/shared/lib/local-storage.ts:32` (`setStoredValue`, the Supabase auth storage)
**Found:** 2026-10-22 during 40e4a's simulator and emulator qualification
**Why it matters:** Every sign-in logs Expo's warning that the value "is larger than 2048 bytes and it may not be stored successfully", and that a future SDK may throw. Today it is stored and restored: a cold start kept the session on the iOS Simulator and the Android emulator. If an SDK upgrade starts rejecting it, every sign-in would fail to persist, and people would be signed out on each launch.
**Suggested fix:** Store the session in chunks under the 2,048-byte guidance, or keep a key in SecureStore and the encrypted session in ordinary storage, with a migration that reads the old single value. Check before the next Expo SDK upgrade (with F-123).
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
  **Resolution:** Fixed on fix/login-speed (2026-10-30): the proxy verifies with keys shipped in the build (`getProxyJwks`, remote only for a key added since) and reads org visibility and state from the memo straight to the database, dropping the Redis layer and its writers. Local Server-Timing on a fresh process: `jwt_verify` 35 to 1.2ms, `mw_org_access` 472 to 128ms. Not done: overlapping the org reads with verification (nothing left to overlap) and pinning the proxy to pdx1 (would add a hop to static public pages).

### F-131 [P2] fixed - App pages paint nothing until the browser re-checks the session over the network

**File:** `apps/web/src/components/RouteGuards.tsx:94-100`; `apps/web/src/components/AuthProvider.tsx:90-102`; `apps/web/src/lib/browser-auth.ts:190-198`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `ProtectedRoute` shows `BrandLoadingScreen` while `isLoading || !user`. `isLoading` clears only after `getBrowserAuthSession()` and then `supabase.auth.getUser()`, which is a round trip to Supabase Auth. Only then do permissions, bootstrap and the page's queries start. The server has already verified the token, so this is a client waterfall in front of every signed-in page, on top of downloading and hydrating 450-620 KB gzip of JS.
**Suggested fix:** Seed `AuthProvider` with the user and claims the server verified, so `isLoading` starts false, and run `getUser()` in the background as revalidation. Next step: server-prefetch the org bootstrap into the QueryClient.
**Resolution:** Fixed on fix/login-speed (2026-10-30): the `(app)` layout passes the user id its check verified, and `AuthProvider` paints with the cookie session's user when it matches and the token is unexpired, running `getUser()` behind it; a failed check signs out as before. Tested (`AuthProvider.test.tsx`), and seen in the browser: page queries start before `getUser`.

### F-132 [P2] fixed - The sign-in pages load the whole signed-in app shell

**File:** `apps/web/src/app/(app)/login/`, plus `forgot-password`, `reset-password`, `accept-invite` and `auth/verify` under `(app)`; `apps/web/src/app/(app)/layout.tsx:47, 79-126`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `/login` (Speed Insights 73) inherits `force-dynamic`, the layout's session and flag reads, and AuthProvider, QueryProvider, PostHog, AppShell, Header and `app-ui.css`. A production build puts its first-load JS at about 470 KB gzip, more than `/dashboard`. PageSpeed (desktop, 2026-10-30) scored it 76, with 460ms Total Blocking Time and 221 KiB of unused JS, 141 KiB of it in one chunk. It also reports an unused Supabase preconnect and 43 KiB of render-blocking CSS; on mobile that CSS is 1.33s of LCP render delay against a 20ms TTFB.
**Suggested fix:** Move the sign-in routes into a sibling group such as `(auth)` with a thin layout holding only what `OrgLogin` needs (AuthProvider, QueryClient, SignInPrefetch). Keep `app-ui.css` and AppShell out of it.
**Resolution:** Fixed on fix/login-speed (2026-10-30), differently from the suggestion: the sign-in pages stay under `(app)` (they need its auth provider, query cache and `app-ui.css`), and `AppChrome` loads the shell through `next/dynamic` everywhere else. First-load JS gzip: `/login` 467 to 413 KB, `/accept-invite` 467 to 381 KB, `/forgot-password` 461 to 371 KB.

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
**Resolution:**

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
**Resolution:**

### F-144 [P2] open - Creating or answering a shift request waits for every approver's alert to send

**File:** `apps/web/src/app/api/schedule/requests/route.ts:238, 256, 562, 606, 663`; `packages/mobile-api-core/src/shift-requests.ts:168, 180, 550, 573, 594`; `apps/web/src/features/notifications/server/sender.ts:152-300`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** These handlers `await` the dispatch. Per recipient, `sendNotification` makes 6-8 sequential calls (facts, insert, Expo push, preferences, throttle, dedupe, `getUserById`, org name, Resend, insert) before the requester gets a response.
**Suggested fix:** `after(() => dispatchNotificationEvent(...))`, as `shifts/publish/route.ts:149` already does.
**Resolution:**

### F-145 [P1] unverified - About 15 fire-and-forget alert dispatches may be cut off after the response

**File:** for example `apps/web/src/app/api/employees/manage/route.ts:691, 964`, `schedule/manage/route.ts:2535, 2607`, `stripe/webhook/route.ts:142`, `features/mobile/server/routes/people.ts:254`, `organizations/access/route.ts:379` (`void dispatchNotificationEvent(...)`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** On Vercel, work left running after a response is not guaranteed to finish without `after()` or `waitUntil`, so these alerts and emails could be dropped silently. Unconfirmed: whether production's function settings let them finish.
**Suggested fix:** Wrap each in `after()`. To confirm, compare sent-alert rows against the triggering audit rows in production.
**Resolution:**

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

### F-153 [P3] unverified - Mobile startup and list rendering costs

**File:** `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:223` and `StartupSplashGate.tsx:76-104` (session, then bootstrap, then the Home prefetch); `apps/mobile/src/shared/components/Screen.tsx:335, 349` (inline `renderItem`, and a new separator component type each render); `ScheduleScreen.tsx:680` (a one-minute clock re-renders the screen)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Three round trips in a row before Home has content. Separators remount and rows re-render on each keystroke or refetch. Needs on-device profiling.
**Suggested fix:**

- Start `/me/schedule` alongside bootstrap.
- Use a stable `renderItem` and separator, and memo the rows.
- Push `now` down to the rows that show relative time.
  **Resolution:**
