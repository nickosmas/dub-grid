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

### F-121 [P3] fixed - Latent inventory parser traps

**File:** `scripts/documentation/inventory.ts:531` (`resolveSourceModule`), walk helpers; `scripts/documentation/check.ts:84`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** each needs a real source to trigger it: an `@/` import in Settings would make the digest read a nonexistent path and crash; a `page.tsx` or `route.ts` under a Next private (`_x`) or `@slot` folder would count as a route; `statSync` follows symlinks, so a loop recurses; untracked local files feed the inventory, so `docs:check` can fail locally but pass in CI; with no `.gitattributes`, a CRLF checkout fails frontmatter parsing and the byte compare.
**Suggested fix:** resolve aliases through tsconfig paths, skip private and slot folders, walk with `lstat` and skip links, and add `* text=auto eol=lf` for the generated and docs files.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): `walkFiles` uses `lstat` and skips links, so a link to an ancestor can no longer recurse; web pages and Route Handlers skip private (`_name`) and `@slot` folders; and `resolveSourceModule` and the Route Handler re-export resolver resolve an aliased specifier (`@/x`) through the nearest tsconfig's `paths`, bounded by the repository root, instead of the digest reading a path that doesn't exist. `.gitattributes` keeps the docs pages and the generated files LF (every one already was, so nothing renormalized). Tests in `docs-inventory.test.ts` fail on the old parser (the link test with ELOOP). The regenerated inventory is unchanged and `docs:check` passes. Not done: untracked local files still feed the inventory, so `docs:check` can still differ between a working tree and CI.

### F-122 [P3] fixed - The env-module declaration pattern could count any uppercase object key

**File:** `scripts/documentation/inventory.ts` (`discoverEnvironmentKeys`, schema-property match)
**Found:** 2026-09-28 by `/audit` (re-review of F-115 on feature/40a-docs-inventory)
**Why it matters:** in an `env.*` module every indented `UPPER_CASE:` key is recorded as a declared environment key, not only properties of the Zod schema. Every current match is a real schema key, so nothing is wrong today; a lookup table with uppercase keys in an env module would add phantom keys that then fail classification.
**Suggested fix:** read keys only from the object literal passed to `z.object(...)` (the TypeScript AST the route parser already uses), or accept the unclassified-key failure as the guard.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): an env module's declarations come from the TypeScript AST, only from the property names of object literals passed to `z.object(...)`, so an uppercase lookup table beside the schema adds nothing. `docs-inventory.test.ts` covers it and fails on the old pattern; the regenerated inventory is unchanged.

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

### F-125 [P3] fixed - Vitest's mocker advisory needs the Vitest 4 major

**File:** `package.json` (`vitest` ^3.2.7, `@vitest/coverage-v8` ^3.2.7) and each workspace's Vitest config; Dependabot alerts 185, 186
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** `@vitest/mocker`'s redirect mock can read files outside the project (path traversal), fixed only in 4.1.11; every 3.x release is in range. Vitest runs only on developer machines and in CI over this repo's own tests, so the exposure is a crafted test or mock path in a change we review.
**Suggested fix:** Upgrade `vitest` and `@vitest/coverage-v8` to 4.1.11 or later in one change across web, mobile and the packages, following Vitest's 4.0 migration notes, and run every workspace's suite. Medium severity, below the `deps:audit` gate.
**Update 2026-10-13:** two critical tinypool advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr, prototype-pollution gadgets reaching code execution through worker options) now put Vitest 3 above the gate. tinypool 2.1.2 fixes them and Vitest 3 cannot take it. All three are allowlisted in `scripts/audit-check.mjs` until 2026-11-15 (fix/dependency-audit); do the upgrade (Vitest 5.0.4 is current) before then rather than re-dating the entry.
**Update 2026-10-31:** a fourth advisory, GHSA-qxg6-89mg-rqv8 (mock registration code injection, fixed in 4.1.12), joined the Vitest entry; its date stays 2026-11-15.
**Resolution:** Fixed on fix/vitest-4 (2026-11-13): `vitest` and `@vitest/coverage-v8` go to 4.1.12, which fixes the mocker advisories and drops tinypool, so the allowlist entry is removed and `deps:audit` passes. npm 10.9.2 crashed resolving Vitest 4's own `vite` dependency (an arborist peer-set bug through vite 8's optional devtools peers); an override (`"vitest": { "vite": "$vite" }`) keeps Vitest on the root vite 7, and a second lock-only install is byte-identical. `minWorkers` is gone from the web config, and four tests moved to Vitest 4's mock rules: a constructor mock is a `function`, and `restoreAllMocks` no longer clears `vi.fn()` mocks. Every workspace's suite passes in a worktree with its own `npm ci`.

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
**Update 2026-11-13 (re-check against dev):** the suggested fix now conflicts with later work. The layout verifies the session on the server to paint at once (F-131) and reads client flags (F-158), and the sign-in pages moved onto the nonce policy (F-204). Prerendering would lose the first and need `'unsafe-inline'` again. Measure cold starts before pursuing it.

### F-134 [P2] fixed - Sentry's full SDK, Session Replay included, downloads and parses on every page at boot

**File:** `apps/web/src/lib/sentry.ts:84` (`void import("@sentry/nextjs")` at module load); `apps/web/src/instrumentation-client.ts:60-68`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** The async chunk is 588 KB raw / 184 KB gzip and contains rrweb and `replayIntegration`, though Replay only attaches with consent. It competes with page chunks for bandwidth and the main thread during hydration, which feeds TBT and INP.
**Suggested fix:**

- Import the SDK on `requestIdleCallback` or after `load`; the existing queue already covers early errors.
- Load Replay through `lazyLoadIntegration` only after consent.
- Add Sentry's `bundleSizeOptimizations` (exclude the replay iframe, shadow DOM and worker).
  **Resolution:**
  **Update 2026-11-13 (re-check against dev):** still open. Don't use `lazyLoadIntegration`: it loads from Sentry's CDN, which the CSP doesn't allow. Import the SDK on idle or `load` and add `bundleSizeOptimizations`; Replay stays in the one SDK chunk on purpose.
  **Update 2026-11-13 (fix/web-page-weight):** fixed as the re-check suggested. `lib/sentry.ts` starts the SDK import after the page's load event and an idle callback (a 500ms timer where Safari has none), and until it loads an uncaught error or rejection is queued for it (`bufferEarlyErrors`), so nothing thrown at startup is lost. On a local production build the page's chunks finished at 0.66s, load at 0.70s, and the 158 KB gzip Sentry chunk was requested at 3.7s. Tested in `sentry-loading.test.ts`. `bundleSizeOptimizations` not added.

### F-135 [P2] fixed - Each staff-search keystroke re-renders every Schedule grid section

**File:** `apps/web/src/components/ScheduleGrid.tsx:1076-1090` (`sectionBlockPropsAreEqual`); `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:2920-2930`; `Toolbar.tsx:636`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** `searchMatchedEmployeeIds` is a new Set per keystroke and reaches every section as `highlightEmpIds`. The comparator returns false for any changed prop outside `CELL_READ_KEYS` and `CONTENT_COMPARED_KEYS`, and this one is in neither. Rows and cells are not memoized, and React Compiler is off, so every cell re-renders while typing. `MonthView` is not memoized either. This is a likely part of the 360ms p75 INP.
**Suggested fix:** Pass `useDeferredValue(staffSearch)` (or a 150ms debounce) to the grid. Compare `highlightEmpIds` by membership for the section's own employees. Wrap `MonthView` in `memo`.
**Resolution:** Fixed on fix/performance-quick-wins (2026-11-13), as suggested: the grid and Month view highlight from `useDeferredValue(staffSearch)`, so the field updates at once and the grid follows in a render React can interrupt. `sectionBlockPropsAreEqual` compares the highlight with `sameSearchHighlight` (whether anyone matched, and which of the section's own people did), and `MonthView` is memoized. Tested in `schedule-grid/searchHighlight.test.ts`; the INP change is not measured.

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
**Update 2026-11-13 (re-check against dev):** requests are filtered by `empId`, and these queries now load only on the Schedule or Requests tab. The employee-then-recurring waterfall, organization-wide corrections and notes, every profile change request, and `directory.find` per row are still open.

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
  **Update 2026-11-13 (re-check against dev):** every part is still present. Narrow the font advice: keep the DM Sans preload (every header's wordmark uses it) and drop only DM Mono if it isn't above the fold.
  **Update 2026-11-13 (fix/web-page-weight, measured):** a production build of dev puts first-load JS at 585 KB gzip on `/schedule`, 579 on `/people/[id]`, 556 on `/people` and 384 on `/dashboard`; 371 KB is shared by every app page (React DOM 72, Supabase auth and realtime 65, Next runtime 41, React Query and zod). Loading Schedule's Month view, history panel and modals, the person page's dialogs and the sandbox dialog on demand saved only 6, 2 and about 1 KB, so those were left static; Settings' billing-only screen loads `BillingSettings` on demand (-14 KB). The remaining weight is the pages' own grid and editors, not on-click code.

### F-141 [P2] unverified - RLS policies call SECURITY DEFINER helpers per row instead of once per query

**File:** `supabase/migrations/003_rls_policies.sql:578-590, 937-941`, `035_draft_state_editor_only.sql:12-35`, and the `gridmaster_all_*` policies; helpers in `016_harden_authorization_boundaries.sql:32` and `002_functions_triggers.sql:88-102`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** 221 policy uses of `caller_org_id()` and none wrapped as `(SELECT ...)`, likewise `check_admin_permission`, `is_gridmaster` and `auth.uid()`. Unwrapped, Postgres may evaluate them per row; each queries membership tables. The grid reads cells, snapshots and segments through RLS with the browser client (`lib/db/shifts.ts:54-66`), and Realtime re-checks policies per change per subscriber.
**Suggested fix:** EXPLAIN ANALYZE a grid read on a seeded large org. If the helpers appear per row, add a migration recreating the hot policies with `(SELECT public.caller_org_id())` and the like.
**Resolution:**

### F-142 [P2] fixed - The hourly expiry cron re-dispatches every lapsed invitation, forever

**File:** `apps/web/src/app/api/cron/expire-requests/route.ts:85-105`; `apps/web/src/app/api/cron/trial-expiry/route.ts:111-145` (pass 2, daily)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- The query selects every expired, unaccepted, unrevoked invitation, with no "notified" marker and no ORDER BY, and `.limit(500)`.
- It dispatches each one serially. Each dispatch runs three lookups before its dedupe check.
- The work grows with every invitation that ever lapses. Past 500, newly lapsed ones may never be picked.
- The cron routes set no `maxDuration`.
- Trial-expiry pass 2 re-dispatches every expired, never-paid organization daily.
  **Suggested fix:** Bound the window (`expires_at > now() - interval '2 hours'`) or add an `expiry_notified_at`. Add an ORDER BY. Dedupe before the lookups. Set `maxDuration`.
  **Resolution:** Fixed on fix/performance-quick-wins (2026-11-13): the invitation pass reads only invitations that lapsed in the last six hours, oldest first. Six hours rather than two because the hourly run comes from GitHub Actions, whose schedules can run late or be skipped, and the dedupe makes the repeats harmless. Every cron route sets `maxDuration = 60`, which the Hobby plan allows with or without Fluid compute. Tested in `expire-requests/route.test.ts`, which fails on the old query. Left alone: dedupe before the lookups, and trial-expiry pass 2, which needs organizations whose trial ended up to the longest grace before it to raise lock alerts, so bounding it is a separate change.

### F-143 [P2] unverified - The notification dedupe has no index to use, and notifications are never pruned

**File:** `apps/web/src/features/notifications/server/events.ts:1462-1474` (`hasExistingNotification`: `org_id`, `type`, `metadata->>key`); notifications indexes in `001` all lead with `user_id`; `sender.ts:289` (an email-tracking row per email)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Likely a scan of the org's notifications on each dedupe. The crons in F-142 and the Stripe webhook call it per row, and the table only grows.
**Suggested fix:** EXPLAIN it. Add a partial index on `(org_id, type)` or dedupe per recipient through the `user_id` index. Add retention for read, archived and email-tracking rows.
**Resolution:** Re-examined 2026-10-30 (second /audit pass): no notifications index leads with `org_id` (`001:1432-1436`), so the dedupe can only filter after reading across organizations; five overlapping `user_id` indexes also slow every insert. Still needs EXPLAIN.
**Update 2026-11-13 (re-check against dev):** still open. Add the `(org_id, type)` index; don't dedupe per recipient, which would send a duplicate to someone added after the first alert.

### F-144 [P2] fixed - Creating or answering a shift request waits for every approver's alert to send

**File:** `apps/web/src/app/api/schedule/requests/route.ts:238, 256, 562, 606, 663`; `packages/mobile-api-core/src/shift-requests.ts:168, 180, 550, 573, 594`; `apps/web/src/features/notifications/server/sender.ts:152-300`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** These handlers `await` the dispatch. Per recipient, `sendNotification` makes 6-8 sequential calls (facts, insert, Expo push, preferences, throttle, dedupe, `getUserById`, org name, Resend, insert) before the requester gets a response.
**Suggested fix:** `after(() => dispatchNotificationEvent(...))`, as `shifts/publish/route.ts:149` already does.
**Resolution:** Fixed on fix/performance-quick-wins (2026-11-13): `dispatchNotificationEventAfterResponse` (`features/notifications/server/after-response.ts`) hands the send to `after()`. The web requests route uses it for every action, and the mobile routes pass it to `mobile-api-core` as the injected dispatcher, so the package stays free of Next. `settleOrNotify` still settles and picks the alert before answering, since the response reports the settlement. Route tests show the response comes back before the alert is sent.
**Update 2026-11-13 (re-check against dev):** still open: #286 moved other routes to `after()` but not these. Keep `settleOrNotify`'s choice of event synchronous and defer only the dispatch.

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
  **Update 2026-11-13 (re-check against dev):** still open; 51j's can-still-sign-in check adds to each recipient's chain. A batched version must keep 51j's gating and 46f's visibility rules.

### F-147 [P2] unverified - Publish reads every cell in the period, not only the changed ones

**File:** `supabase/migrations/092_absence_times.sql:966-1015` (`publish_schedule_unguarded`)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:**

- For every cell in the range it calls two non-inlinable SECURITY DEFINER lateral functions (the draft and published payloads), even when a few cells changed.
- `v_changes := v_changes || jsonb_build_array(...)` copies a growing array each time, which is O(n²).
- Unmeasured.
  **Suggested fix:** EXPLAIN on a month publish in a large org. Restrict to cells with a draft snapshot (`EXISTS`), and build changes with `jsonb_agg` or direct inserts. Check discard for the same shape.
  **Resolution:**
  **Update 2026-11-13 (re-check against dev):** still open (latest definition in 092). A rewrite must keep `ORDER BY c.id` (the lock order shared with discard) and the 114/116 organization advisory lock.

### F-148 [P2] open - Batch cell saves query per cell

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1502` (`Promise.all` over up to 50 cells), `:1037-1058`, `:805-808` (`readCellStateForAudit`), `:949+`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** Each cell makes two before-state reads, an RPC, possibly a note clear and an audit insert. That is about 150-200 round trips per 50-cell batch, which is how bulk edits, paste and Auto-build Apply save.
**Suggested fix:** One before-state read and one audit insert per batch, with bounded concurrency. A set-based RPC later.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** partly fixed: the audit insert runs in `after()` (#286). Two reads and an RPC per cell with no concurrency cap remain; a set-based version must keep the per-cell saved, conflict and error outcomes.

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
  **Update 2026-11-13 (re-check against dev):** (g) is partly fixed: `return-from-away` batches its away and suspension passes. Everything else is still open.

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
  **Update 2026-11-13 (re-check against dev):** one invalidation per flush with `cancelRefetch: false` is fixed. Draft tables for every user, the fixed 150ms window, no `publish_history` keying for non-editors and the `audit_log` subscription are still open. Plan with F-199.

### F-151 [P2] fixed - Mobile schedule endpoints load every publish change in the organization and scan it per entry

**File:** `packages/data-access/src/mobile.ts:917-918` (unfiltered `schedule_publish_changes` embed); `apps/web/src/features/mobile/server/data.ts:1012` (`findPublishedChangeForCell` per row), `:867`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance)
**Why it matters:** One person's week on `/me/schedule`, `/org/schedule` or `/shift-requests` pays for every employee's changes in every overlapping publish. That is O(rows × changes), with two Zod parses per change. F-150 makes these calls frequent.
**Suggested fix:** Filter the embed by `emp_id` (when scoped) and date, and index changes in a `Map` keyed `emp:date` before the loop.
**Resolution:** Fixed on fix/performance-quick-wins (2026-11-13): `fetchMobilePublishHistoryRows` takes `changesInRange`, which filters the embedded changes to the range's dates and, when set, one person. The schedule entries pass it with their person, the coverage inputs (which read only published dates) pass it too, and the dashboard leaves it out because its activity line counts a publish's whole set of changes. `fetchMobileScheduleEntries` builds one `emp:date` map (`indexPublishedChangesByCell`) and both per-cell lookups read it. Tests show the map returns the same change as the old scan, and that the filters apply only when asked.

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
  **Update 2026-11-13 (re-check against dev):** partly fixed: bootstrap starts at module load (F-183) and a restored cache starts Home at once (F-181). On a cold cache `/me/schedule` still waits for bootstrap; the inline `renderItem`, separator and minute clock are still open.

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
**Update 2026-11-13 (re-check against dev):** still open. Don't drop `setBrowserSession`: it prevents a 403 race on the aal2 cookie. Replace it with a write that skips the round trip.

### F-161 [P3] unverified - `SignInPrefetch` pulls dashboard, roster and billing modules into the `/login` bundle

**File:** `apps/web/src/components/SignInPrefetch.tsx:9-16`, imported by `apps/web/src/app/(app)/layout.tsx` and `OrgLogin.tsx:12`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** It statically imports `dashboardQueries` (shift requests, shift-change formatting, schedule view), `useOrganizationData`, `useEmployees` (realtime-core, step-up) and the gridmaster and billing clients, all of which run only after a submit. Not in F-140; size unmeasured.
**Suggested fix:** Move the priming into a module loaded with `import()` on submit.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. Narrow the fix: since F-156 the same component primes hard loads from the layout, so lazy-load it only on `/login` and the submit path.

### F-162 [P3] fixed - The background `getUser` on a hard load holds the auth lock that browser queries wait on

**File:** `apps/web/src/components/AuthProvider.tsx:138`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** auth-js keeps its lock across the `getUser` network call, and every browser-direct query (schedule cells and notes in `lib/db/shifts.ts`, realtime `setAuth`) calls `getSession`, which queues behind it. Probably hidden behind the bootstrap wave; unmeasured.
**Suggested fix:** Call `getUser(session.access_token)`, which skips the lock.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13) in `lib/browser-auth.ts`, since `AuthProvider.tsx` calls it: `getVerifiedBrowserUser` reads the session (or takes the token it is handed) and calls `getUser(accessToken)`, which asks the auth server without taking the lock, and `getVerifiedBrowserAuth` passes the token it already read. No session now answers no user without a request. `browser-auth.test.ts` checks the token is passed and fails on the old code; not measured in a browser.

### F-163 [P2] open - One realtime event is invalidated once per table and re-broadcast to tabs that already received it

**File:** `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:184-190` (`invalidateOrgRealtimeQueries`), `:226-229` (`onFlush`); `apps/web/src/lib/cache-broadcast.ts:39-43`; `packages/realtime-core/src/debounced-flusher.ts`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** A cell save touches `schedule_cells`, `schedule_cell_snapshots` and `schedule_cell_segments`, which map to the same keys, so each key is invalidated three times per flush with the default `cancelRefetch`, restarting fetches whose requests still go out. Every invalidation is also broadcast to other tabs, which got the same event on their own channel and invalidate again, so load grows with the square of open tabs. The 150ms fixed-window flusher fires about seven times a second through a paste or Auto-build Apply. `permissionsRealtime.ts:63-66` already uses `cancelRefetch: false`. The web side of F-150.
**Suggested fix:** Collect the union of keys per flush and invalidate each once with `{ cancelRefetch: false }`; don't re-broadcast keys that came from realtime; make the flusher trailing with a 1-2s max wait.
**Resolution:**
**Update 2026-11-13 (fix/report-refresh-published-only):** the web org channel now invalidates the union of a flush's keys once each with `cancelRefetch: false` (`getOrgRealtimeFlushKeys`). Still open: the re-broadcast to other tabs and the fixed 150ms window, which move with F-199.

### F-164 [P2] fixed - Draft edits regenerate the published-only operations report

**File:** `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:138-145`; `apps/web/src/app/(app)/reports/ReportsPageContent.tsx:479-497`; `apps/web/src/features/reports/server/operations.ts:477, 942`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `reports.operationsAll` is invalidated on every change to the three cell tables, though the report reads published data only. A manager with a long-range report open has it re-aggregated on the server on every peer's draft save, multiplied by F-163.
**Suggested fix:** Drop `reports.operationsAll` from the cell-table cases; keep it for `publish_history`, `employees` and `recurring_shifts`.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** the suggested fix would regress item 53: a past-day correction writes published cells with no `publish_history` row, so the cell tables are the report's only signal. Invalidate `reports.operationsAll` on correction events (or published-snapshot changes) instead, together with F-163.
**Resolution:** Fixed on fix/report-refresh-published-only (2026-11-13), on published-snapshot changes as the re-check said: the cell tables no longer invalidate `reports.operationsAll`, and `changesPublishedSchedule` adds it to the flush when a `schedule_cell_snapshots` event carries `snapshot_kind = published` (every publish, approval and correction upserts that row) or is a DELETE, whose payload holds only the id. Tested in `org-realtime-invalidation.test.ts`.

### F-165 [P2] fixed - The header loads the organization's whole roster on every page for one boolean

**File:** `apps/web/src/components/AppShell.tsx:60-63`; `apps/web/src/hooks/useEmployees.ts:130-135`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `useEmployees` fetches every employee, archived included, only for `employees.length > 0` in the setup lock. It mounts on every app route, staff included, and keeps `employees.all` observed everywhere, so every employee, department, certification or role change refetches the full roster in every tab. It is also wave 2 of F-156.
**Suggested fix:** Use `useEmployeeCount` (already keyed under `org.employeeCount`), or enable the roster only while onboarding is incomplete.
**Resolution:** Fixed on fix/sign-in-cold-open-speed (2026-10-30): the header reads the bootstrap's `activeEmployeeCount`, as `SetupGuard` does; in the browser `/alerts` loads no roster.

### F-166 [P3] fixed - Opening Schedule refetches the directory in every other tab in the organization

**File:** `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1656, 6518, 8975` (`updateScheduleLastViewed`); `apps/web/src/hooks/useOrgRealtimeInvalidation.ts:134-135`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Writing `organization_memberships.schedule_last_viewed_at` makes the org channel invalidate `org.users` and `org.directory` everywhere that can see the row. `permissionsRealtime.ts:110-113` already ignores that column; the org channel doesn't.
**Suggested fix:** Ignore membership updates that change only `schedule_last_viewed_at`, as the permissions path does.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): `subscribeOrgScopedRealtime` takes a `skipEvent`, and the org channel uses it to absorb a membership UPDATE whose new row matches the cached directory entry in every field the directory takes from the membership (role, permissions, management departments and their admin subset, phone, not archived). Since the stamp also moves `updated_at`, the cached `membershipUpdatedAt` moves forward in place, so the next role or permission edit still passes its conflict check. Anything it can't compare refetches as before: no cached directory, a person whose account the viewer can't see (a regular member's directory has no `userId`), or a timestamp without an offset. Tested in `useOrgRealtimeInvalidation.test.ts` and `org-scoped-subscription.test.ts`; not run against live Realtime, so the payload's timestamp format is assumed to carry an offset (one without refetches).
**Update 2026-11-13 (re-check against dev):** still open. The org channel has no old values to compare, so compare the new row with the cached one, as the permissions path does.

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
**Update 2026-11-13 (re-check against dev):** still open. The month grid pads past the period, so widen the period query to the padded grid rather than serving the grid from the period.

### F-169 [P2] unverified - Every in-app navigation waits on the proxy and a function render, Back included

**File:** `apps/web/src/app/(app)/layout.tsx:47` (`force-dynamic`); `apps/web/next.config.ts:64-76` (no `experimental.staleTimes`); `apps/web/src/proxy.ts:824-826` (matcher includes RSC requests)
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** The page segments are client wrappers with no server data, yet each click, including Back to a visited page, goes edge proxy (verify, org memo, database) then a pdx1 render before the page swaps, with a bare `ProgressBar` meanwhile. Related to F-133 (hard loads); this is soft navigation. Latency unmeasured.
**Suggested fix:** Set `experimental.staleTimes: { dynamic: 30 }` so visited segments are reused from the router cache; measure a click before and after.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. With `staleTimes`, a revisited route skips the proxy's lock and suspension redirects for up to 30 seconds (APIs still refuse), so confirm an organization switch and impersonation clear the router cache.

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
**Update 2026-11-13 (re-check against dev):** still open; the notes pre-read is paged now, the cells read isn't. Counting `schedule_publish_changes` after the RPC must leave out note rows and apply the banner's added-beside-published rule.

### F-172 [P2] open - The shift-request list has no limit, no paging and no index for its sort or date filter

**File:** `apps/web/src/app/api/schedule/requests/route.ts:303-378`; indexes in `supabase/migrations/001_schema.sql:1460-1466`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `select('*')` with two employee embeds, ordered by `created_at`, no limit. The History tab (`ShiftRequestBoard.tsx:195`) and the staff page (`StaffDetailPage.tsx:962`) fetch the whole history, which grows with every request ever made and stops silently at 1,000 rows. The date filter ORs `requester_shift_date` and `target_shift_date`, neither indexed, and nothing indexes `(org_id, created_at)`.
**Suggested fix:** Keyset paging with a limit, narrower columns, and an index on `shift_requests (org_id, created_at DESC)`.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. Staff are now scoped on the server; paging must keep that scope and the open-pickup pool.

### F-173 [P2] closed - The staffed call-off trigger resolves every publish change before checking whether any pickup is waiting

**File:** `supabase/migrations/099_away_until.sql:3811-3930` (`finalize_scheduler_staffed_calloffs`, AFTER INSERT on `schedule_publish_changes`); `082` `resolve_schedule_state_storage`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** Each worked change runs `resolve_schedule_state_storage` twice (several job, shift and absence-type lookups) before scanning for open pickups that day, which usually returns none. A month publish for 150 people is about 3,000 runs. Out of lens and unchecked: `resolve_schedule_state_storage` raises on a since-archived job or shift, which could fail a whole publish.
**Suggested fix:** Return early unless an open pickup with a parent exists for the org and date (`idx_shift_requests_org_open_pickups`). Check the archived-reference case separately.
**Resolution:** Fixed by migration 117 (`117_archived_items_stay_scheduled.sql`), found by the 2026-11-13 re-check: `finalize_scheduler_staffed_calloffs` returns early unless an open pickup with a parent exists for the organization and date, and uses `resolve_existing_schedule_state_storage`, so an archived reference no longer fails a publish.

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
**Update 2026-11-13 (re-check against dev):** still open, with less to gain: Offboard and Away with no return take the organization publish lock (114/116), so they run one at a time anyway. Cap concurrency for the rest and add `maxDuration`.
**Update 2026-11-13 (fix/p3-quick-wins):** the route sets `maxDuration = 60`, the Hobby plan's ceiling without fluid compute, matching the cron routes. Still open: bounded concurrency for the actions that don't take the publish lock.

### F-176 [P2] fixed - The hidden-people filter scans every profile on the platform, unindexed, before most schedule and people reads

**File:** `packages/data-access/src/internal-people.ts:17-23`, then `:37-50`; for example `apps/web/src/app/api/schedule/manage/route.ts:1134`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** `profiles where is_internal = true` has no index, so it reads every user across every organization, serially before `fetchHiddenEmployeeIds`, on about 40 call sites. It grows with the platform, not the organization.
**Suggested fix:** A partial index on `profiles (id) WHERE is_internal`, plus a 30s in-process memo, since the list is platform-wide.
**Resolution:** Fixed (2026-11-13): the 30-second memo shipped with F-185, and migration 138 on fix/performance-quick-wins adds the partial index `idx_profiles_internal` on `profiles (id) WHERE is_internal`, so the internal-accounts lookup no longer scans every profile. Checked in a rolled-back transaction on the local stack: the lookup used an Index Only Scan.
**Update 2026-11-13 (re-check against dev):** half fixed: the 30-second memo shipped with F-185. The partial index on `profiles (id) WHERE is_internal` is still missing.
**Update 2026-11-13 (fix/performance-quick-wins):** the index is written as `138_internal_profiles_index.sql` (`CREATE INDEX IF NOT EXISTS idx_profiles_internal ON public.profiles (id) WHERE is_internal`), and in a rolled-back transaction the lookup used it (Index Only Scan). It isn't committed yet: migration 137 is on another branch, and the migration and documentation checks refuse a gap in the numbering. Commit it once 137 is on `dev`.

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
**Update 2026-11-13 (re-check against dev):** still open. Do it with F-199 so the publication is reworked once.

### F-180 [P3] open - Smaller schedule read costs

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1140-1176`; `apps/web/src/lib/server/schedule-context.ts:20-37`; `CacheKey.employees` in `apps/web/src/lib/cache.ts`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:**

- `fetchShifts` loads draft snapshots for viewers who can't edit, then redacts them.
- `fetchAssignmentContext` makes three uncached queries on every schedule read and echoed save, though cached versions exist in `lib/db/config.ts`.
- `CacheKey.employees` is invalidated in about 15 places and read nowhere.

**Suggested fix:** Skip the draft embed when `!canEditShifts`, use the cached config reads, and delete the unused key's invalidations.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. Change (2): the cached reads in `lib/db/config.ts` skip archived rows and use the user client, while the server needs archived rows (117); use an in-process memo instead.

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

### F-187 [P3] fixed - The mobile session is re-read from SecureStore on every `getSession`, including each realtime heartbeat

**File:** `apps/mobile/src/shared/lib/local-storage.ts:32`; `apps/mobile/src/shared/lib/supabase.ts:28-31`
**Found:** 2026-10-30 by /audit (scope: full; lens: performance; second pass)
**Why it matters:** auth-js re-reads storage on each `getSession`: about five reads of the over-2KB value at launch (initialize, warm, provider, auto-refresh, realtime connect), then one per 25s heartbeat. The comment claiming the work is shared is inaccurate. Cost on the Android keystore unmeasured. Related to F-128.
**Suggested fix:** An in-memory read-through cache in `local-storage.ts`, written through on set and remove.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): `local-storage.ts` keeps each SecureStore value in memory once read or written, shares one read between callers that ask together, writes through on set, and holds `null` after a remove, so sign-out leaves nothing cached. A per-key version stops a read that began before a write from putting the old value back, and a failed write caches nothing. The web path still reads `localStorage` directly. `local-storage.test.ts` covers each case and fails on the old code; not measured on a device.
**Update 2026-11-13 (re-check against dev):** still open; the inaccurate comment is gone. A write-through cache must also clear on remove.

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

### F-189 [P2] fixed - zod 3 can exhaust memory validating an oversized constrained collection, and the fix is zod 4

**File:** `package.json`, `apps/web/package.json`, `packages/contracts/package.json` (`zod` 3.24.4); 104 files import it in `apps/web/src` and `packages/contracts/src`; `scripts/audit-check.mjs` allowlist
**Found:** 2026-10-31 while clearing the Dependency Audit gate (fix/dependency-audit-gate)
**Why it matters:** GHSA-mrhx-c7xc-m3w5 (high): a huge array posted against a schema with a length or size constraint walks every element before the constraint fails, so request validation in the web routes and the mobile API can be pushed into memory exhaustion. Vercel caps a request body at 4.5 MB, which bounds what one request supplies. Fixed only in zod 4.6.6.
**Suggested fix:** Upgrade to zod 4 across web, mobile and the packages in one change (Dependabot #190 has the version bump; the schema API changes need the code), keeping one zod copy so `instanceof` checks hold (see the identical-specifier note). The allowlist entry holds until 2026-12-01.
**Resolution:** Fixed on fix/zod-4 (2026-11-13): web, the contracts package and the root go to zod 4.6.7, one copy, and overrides pin the zod 4 copies under eslint-plugin-react-hooks and the shadcn MCP server to it. zod 4 changed `.uuid()` to accept only RFC 9562 UUIDs, which would refuse ids Postgres accepts (fixed seed and test ids such as `00000000-0000-0000-0000-000000000001`), so every `z.string().uuid()` became `z.guid()`, which keeps zod 3's rule. The three `z.record` calls with one argument name their string keys. No schema uses `.default()` inside `.optional()` or an enum-keyed record, the two other changes that pass type-check silently. In the browser zod runs jitless (`lib/zod-jitless.ts`, the first import of `instrumentation-client.ts`): its `new Function` probe breaks the CSP, which forbids eval, and Firefox logged that as an error on every page that parses a schema. The allowlist entry stays, narrowed to zod 3.25.76 inside `@expo/cli`, `@snaplet/seed` and the shadcn CLI, which require zod 3 and validate only our own config and seed templates.

### F-199 [P2] open - Realtime sends every signed-in user the ids of rows deleted in other organizations

**File:** `supabase/migrations/001_schema.sql:1604` (the `supabase_realtime` publication, 29 tables); `apps/web/src/hooks/useOrgRealtimeInvalidation.ts`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Confirmed live on the throwaway stack: a staff user of org A, subscribed to `schedule_cells` with no filter, received `{"id": ...}` for a row deleted in org B; an UPDATE in org B correctly did not arrive. Postgres Changes cannot apply RLS or filters to DELETE. Only primary keys travel, so the leak is ids, timing and volume, but ids of deleted memberships and profiles are person identifiers.
**Suggested fix:** Move invalidation to Broadcast from the database (`realtime.broadcast_changes`) on the private per-organization channels already in use, then remove these tables from the publication. Until then remove tables no client subscribes to, and check the dashboard's "Allow public access" Realtime setting is off.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. The fix also has to move the mobile invalidation hook. Plan with F-150, F-163 and F-179.

### F-200 [P2] fixed - Super Admins can change write-once organization fields directly, including the subdomain

**File:** column UPDATE grants on `organizations` to `authenticated` (`slug`, `feature_overrides`, `employee_count`, `data_retention_days`, among others); `admin_update_organization`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Confirmed on the throwaway stack: an org A Super Admin updated their own `slug`, `feature_overrides` and `employee_count` through the table. I found no customer path that changes `slug`, which the app treats as permanent. Changing it frees the old subdomain, which another organization's Super Admin can then claim the same way, serving their sign-in page at a name the first organization's staff trust. Taking a name in use and the reserved names were refused.
**Suggested fix:** Revoke UPDATE on `slug`, `employee_count` and any Gridmaster-owned field, or all columns and route writes through `organizations/settings`.
**Resolution:** Fixed on fix/leftover-direct-writes (2026-11-13): migration 137 revokes INSERT, UPDATE, DELETE and TRUNCATE on `organizations` from `authenticated`, which also removes 004's column grants, so no write-once field (the subdomain among them) can be changed through the data API. Every organization write already went through the service client; the unused browser `updateOrganization` is deleted. The live test `migration-137-leftover-direct-writes.integration.test.ts` checks no table or column privilege is left.
**Update 2026-11-13 (re-check against dev):** still open. Revoking every column is safe (settings write through the service client); delete the unused `updateOrganization` in `lib/db/organizations.ts` with it.

### F-201 [P2] fixed - Gridmaster writes don't always need an impersonation, and starting one doesn't always leave an audit row

**File:** `apps/web/src/app/api/employees/manage`, `organizations/settings`, `import/employees`, `shifts/discard`, `employees/status`, `employees/identity` (none set `gridmasterNeedsImpersonation`); `start_impersonation` (migration 057)
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** F-75's rule binds a Gridmaster's organization writes to an active impersonation, but only schedule, requests, recurring, publish and settings/config apply it. A stale or stolen Gridmaster token can edit staff, organization settings or drafts in any organization with no notice to it, and `shifts/discard` uses direct service-role writes that migration 075 doesn't cover. `start_impersonation` writes no `audit_log` row itself: the route does, after the RPC, so a direct call with a fresh-proof token skips it and the notice email (`impersonation_sessions` still records it). The API role stays `gridmaster` while impersonating, so an impersonator isn't limited to the target's rights. Read in code.
**Suggested fix:** Make the impersonation requirement the default for any Gridmaster write in `requireOrgPermissions`, with named exceptions, and apply it in `canManageEmployees`. Write the audit row inside `start_impersonation`, as migration 071 does elsewhere.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** employee import now requires impersonation. Owner decision (2026-11-13): keep 075's rule as it is (schedule, requests, publish and settings need an impersonation) and don't extend it to staff, organization settings or discard. Impersonating never narrows a Gridmaster's powers (see F-250). Still worth doing: `start_impersonation` should write its own audit row.
**Update 2026-11-13 (fix/impersonation-start-audit-row):** migration 139 has `start_impersonation` write the `impersonation.started` row itself, in the same transaction as the session, with the caller's address and user agent, so a direct call through the data API is recorded; the route no longer writes its own. Live test: `migration-139-impersonation-start-audit.integration.test.ts`. With the owner's decision above, nothing else in this finding remains, so it is fixed.

### F-202 [P2] open - The server code has no enforced tenant boundary: 196 files can reach the service client

**File:** `apps/web/src/lib` and every route using `serviceClient`; `eslint-rules/`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** RLS is the boundary for browser reads, but most server work uses the service client, which bypasses it, so each query depends on someone remembering `.eq("org_id", ...)`. F-190 is exactly that miss, in 2 of 21 updates in one file, and earlier audits found the same class (F-8 to F-16, 2026-07). `org-isolation.integration.test.ts` is good but tests policies, not routes, and no check covers a foreign id sent to a route.
**Suggested fix:** Add a tenant-scoped helper (`orgDb(orgId).from(table)` that applies the filter), a lint rule refusing a bare `.eq("id", ...)` on a tenant table in a mutation, and a generated CI test that signs in as org A and sends org B's ids to every mutation route. Turn the probes from this audit into a live test over every table in the inventory.
**Update 2026-11-06 (fix/tenant-mutation-guard):** the lint rule is in. `design/no-unscoped-tenant-write` fails an update or delete on an organization's table in `app/api` and `features/**/server` unless it filters on `org_id` or one account. It flagged 16 existing writes. None was exploitable, since each id came from the server or was tied to a person, and each now carries the filter. Still open: the `orgDb` helper, the generated CI test that sends org B's ids to every mutation route, and writes built across several statements, which the rule can't see.
**Resolution:**
**Update 2026-11-07 (review):** the lint rule passes `.upsert`, `.insert`, `.rpc`, a table name in a variable or template, a query split across statements, any `user_id` filter beside `.eq("id", id)`, and `.eq("org_id", body.orgId)`. It leaves out `organizations`, `notifications`, `audit_log`, `user_sessions`, `mobile_device_tokens` and others, and doesn't cover `apps/web/src/lib` or `packages/*`. A scan of all 285 write chains found no service-client update or delete whose only filter is a client-supplied id.
**Update 2026-11-13 (re-check against dev):** the lint rule shipped (#383); the `orgDb` helper and the cross-organization route test are still open.

### F-203 [P2] open - Deleted organizations' data is kept indefinitely and the retention jobs never run

**File:** `purge_expired_data`, `purge_scheduled_accounts`, `flag_inactive_accounts` (no caller in `apps/`, `packages/`, `.github/` or `apps/web/vercel.json`, no `pg_cron`); `apps/web/src/app/api/organizations/delete/route.ts:107`; `apps/web/src/app/privacy/page.tsx:308`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** Organization delete is a soft archive, `purge_expired_data` skips archived organizations, and nothing hard-deletes them, so staff data outlives the customer. The Privacy Policy promises configurable retention, and the open question on self-serve data export is still unanswered. A Supabase dashboard schedule wouldn't show in the repo, so check that first.
**Suggested fix:** Schedule the jobs, define a hard-delete window after archive with a verified per-organization export before it, and align the policy text.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** owner decision (2026-11-13): an archived organization stays restorable by a Gridmaster for 90 days, then a scheduled job deletes it and its staff data; the Super Admin is offered an export in that window, and the Privacy Policy states the 90 days and the backup window. Needs its own spec.

### F-204 [P2] open - Auth cookies are readable by script, and sign-in pages allow inline scripts

**File:** `apps/web/src/lib/auth/session-cookies.ts`, `apps/web/src/lib/supabase.ts`, `apps/web/src/proxy.ts:261` (public pages keep `'unsafe-inline'`), `supabase/config.toml:292`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** No `cookieOptions` are set, so `@supabase/ssr` defaults apply: not HttpOnly, with a 400-day life, which the browser client needs in order to read them. `/login`, `/accept-invite` and `/reset-password` run under `script-src 'unsafe-inline'` though they render dynamically, so an XSS there reads refresh tokens. There is no server-side session time limit; the web idle timeout is client-side only. `connect-src https://*.supabase.co` allows sending data to any Supabase project. Cookies are host-only, which is correct for subdomains. The flag behaviour is from the library's defaults, not observed in production.
**Suggested fix:** Use the nonce CSP on those pages, set Secure and SameSite explicitly, set Supabase's session time-box and inactivity timeout, and narrow `connect-src` to the project host. Moving tokens out of script reach is a larger decision.
**Update 2026-11-08 (fix/sign-in-page-hardening):** the sign-in pages (`/login`, `/goodbye`, `/accept-invite`, `/forgot-password`, `/reset-password`, `/auth/*`) take the nonce policy, `connect-src` names the configured project alone (`https` and `wss`), and every writer of the session cookies sets `SameSite=Lax` and, over https, `Secure` (`authCookieOptions`). The web idle sign-out now runs on one deadline across sleep, reloads and tabs (#410). Still open: cookies stay readable by script, which the browser client needs, and there is no server-side session limit, since Supabase's time-box and inactivity timeout would also sign out the mobile app, which is meant to stay signed in.
**Update 2026-11-08 (fix/web-session-idle-limit):** the server now ends idle web sessions: the web reports activity at most every 5 minutes of use (`touch_web_session`), and the token hook refuses to renew a web session with no report for 35 minutes (migration 128). The access token already issued still runs up to an hour. iOS, Android and a session with no recorded platform are never limited: the app stays signed in until the person signs out (owner, 2026-11-08). Still open: cookies readable by script.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** drop the session time-box and inactivity timeout from the suggested fix: they would sign the mobile app out, against the owner decision that it stays signed in (2026-11-08). Only script-readable cookies remain, which the browser client needs.

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
**Update 2026-11-13 (re-check against dev):** still open. 51j already stops delivery to Suspended and Offboarded people; the gap is a revoked session for someone still a member.

### F-206 [P2] open - The mobile API shows staff more than the organization's settings allow

**File:** `apps/web/src/features/mobile/server/routes/shift-swap-options.ts:207`; `packages/mobile-api-core/src/read.ts:574`; `apps/web/src/features/mobile/server/routes/person.ts:174`; `apps/web/src/features/mobile/server/data.ts:1356`
**Found:** 2026-11-06 by /audit (scope: full; lens: security)
**Why it matters:** Inside one organization: swap options return entries without `withScheduleVisibility`, so item 46f's hidden publisher and change details reach staff. `/people` and `/people/[id]` leave a coworker's suspension, planned status and dates, first day, `orgRole` and `adminPermissions` in the response, and the detail route has no internal-account filter. Staff open shifts are computed from draft rows, so unpublished edits can be inferred. Traced, not run.
**Suggested fix:** Apply the visibility helper to swap options, build the staff response from an allowed-fields list rather than a strip list, and use published rows for anyone who can't edit.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** partly fixed: #515 blanks colleague status in the list and detail and drops admin permissions from the list. Still open: the detail route returns `adminPermissions`, has no internal-account filter, swap options skip `withScheduleVisibility`, and open shifts come from draft rows. An allowed-fields list must keep `orgRole`, roles and departments (#515, 56e).

### F-207 [P2] fixed - Telemetry sends staff emails to third parties and can't be tied to an organization

**File:** `apps/web/src/components/AuthProvider.tsx:100`; `apps/web/src/components/PostHogProvider.tsx:44`; `apps/web/src/lib/sentry.ts:260`; `apps/web/sentry.server.config.ts`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** `setSentryUser` sends the email with no consent gate, despite `sendDefaultPii: false`. `orgId` is never passed, so the `org_id` tag is never set and one customer's events can't be found or removed. PostHog identifies by email (consent-gated) with no organization group. The server config has no `beforeSend`, and `redactSecurityValue` removes secrets, not names or emails.
**Suggested fix:** Send the user id only, set the `org_id` tag, add a server `beforeSend` that drops bodies and emails, and identify in PostHog by id with an organization group.
**Resolution:** Fixed on fix/route-permission-gaps (2026-11-13): Sentry receives the user's id and an `org_id` tag (reset on sign-out), never the email, and server and edge events go through `scrubServerEvent`, which keeps only the user's id and drops request bodies. PostHog already identifies by id and sends the email only with analytics consent, so it is unchanged.

### F-208 [P2] fixed - One attacker can trip the shared login limit for every organization

**File:** `apps/web/src/app/api/auth/login/route.ts:413`; `apps/web/src/lib/rate-limit.ts:134`
**Found:** 2026-11-06 by /audit (scope: full; lens: security, multi-tenancy)
**Why it matters:** The email, IP and `login:global` limiters run together in `Promise.all`, so a request the IP limiter refuses may still count against the global 500 per 10 seconds, which is about 50 requests a second from one address. Mobile shares the key, and recovery has the same shape at 100 per 10 seconds. Upstash's counting wasn't run, so this needs a test.
**Suggested fix:** Check the IP limiter first and only then consume the global one.
**Resolution:** Fixed on fix/route-permission-gaps (2026-11-13), keeping one Redis round trip: web sign-in, mobile sign-in and recovery read the global ceiling with `peekRateLimit` (Upstash `getRemaining`, same fail-closed policy) alongside the email and IP limits, and spend it in `after()` only for a request those limits admit. A source the IP limit refuses no longer counts against everyone. A burst inside one round trip can pass the ceiling slightly. Route and unit tests cover the read, the spend only on admission, and the refusal when the ceiling is used up.
**Update 2026-11-13 (re-check against dev):** still open, in three places: web login, mobile login and recovery.

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
**Update 2026-11-13 (re-check against dev):** per item: (2) owner decision (2026-11-13): suspending or offboarding someone ends only their sessions in that organization, as Move email does, replacing 51c and 51k's "everywhere". Fixed on fix/sessions-end-in-one-org: `endUserSessionsInOrganization` ends each session whose `active_org_id` is the organization, and Suspend (web, app, bulk, a planned start), Offboard and removing a member use it; the roster guide says so. (9) `job_shift_overrides` now has composite foreign keys (124). Everything else is still open.

### F-214 [P2] fixed - An Admin who can edit notes can publish or delete published notes directly

**File:** `003:391-403` (policies on `canEditNotes`, any status), `004:59`; `apps/web/src/app/api/schedule/manage/route.ts:2528` (published status taken from the client's `existingStatus`)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security)
**Why it matters:** F-197's hole on `schedule_notes`. On the stack an Admin with only `canEditNotes` inserted a `published` note directly, past publish, the audit log and alerts. Sending `draft_deleted` to the route reaches the same result, traced only. `authenticated` also holds TRUNCATE on the table, which PostgREST can't reach.
**Suggested fix:** Revoke writes as 122 does, after confirming no client writes remain, and read the note's status from the database in the route.
**Resolution:** Fixed on fix/leftover-direct-writes (2026-11-13): migration 137 revokes every write on `schedule_notes` from `authenticated` (all note writes are service-client route writes), and the route reads the note's stored status before saving or deleting instead of trusting the client's `existingStatus`. Route tests fail on the old code: a claimed draft no longer deletes a published note, a claimed `draft_deleted` no longer publishes a new one, and a note already gone writes nothing.
**Update 2026-11-13 (re-check against dev):** still open. Every note write is a service-client route write, so revoking is safe.

### F-215 [P2] fixed - Deleting a focus area, shift or job directly rewrites published schedule rows

**File:** `003:210, 306, 330` (delete policies), `004:59`; `001` (`ON DELETE SET NULL` on `schedule_cells.focus_area_id`); `schedule_cell_segments` (no foreign key)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security)
**Why it matters:** Referential actions run as the owner, so 122 doesn't stop them. On the stack a Super Admin's direct `DELETE` on `focus_areas` cleared the focus area from its published cells, past days included, past the settings route's in-use checks. Direct deletes on `shift_categories` or `jobs` should leave segments pointing at nothing, traced only.
**Suggested fix:** Revoke DELETE on these tables from `authenticated`, since the settings route archives or checks use through the service client.
**Resolution:** Fixed on fix/leftover-direct-writes (2026-11-13): migration 137 revokes DELETE and TRUNCATE on `focus_areas`, `shift_categories` and `jobs` from `authenticated`, so their ON DELETE actions can only run through the settings route's service-client deletes, after its in-use checks.
**Update 2026-11-13 (re-check against dev):** still open. The only hard deletes are service-client calls in the settings route, so revoking is safe.

### F-216 [P2] fixed - Archiving a focus area leaves it on every person

**File:** `apps/web/src/app/api/settings/config/route.ts:651`; `remove_focus_area_from_employees` (`002:7533-7536`)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: quality)
**Why it matters:** The route calls the function with the service client, and the function filters on `caller_org_id()`, which is NULL there. On the stack it ran with no error and all 15 people stayed on the area. The route's test mocks the RPC. `validateStaffOrgReferences` should then reject the archived id on that person's next save, traced only. It fails closed, so it isn't a tenant leak.
**Suggested fix:** Pass the organization into the function, and filter on it.
**Resolution:** Fixed on fix/leftover-direct-writes (2026-11-13): migration 137 replaces `remove_focus_area_from_employees(BIGINT)` with `(BIGINT, UUID)`, which removes the area only from that organization's people. The service role may name any organization; any other caller must be signed in to it (`refuse_caller_outside_org`) and allowed to manage focus areas. The settings route passes the effective organization (tested against a sandbox), and the live test proves another organization's people are untouched.
**Update 2026-11-13 (re-check against dev):** still open. When adding `p_org_id`, keep checking it against `caller_org_id()` for non-service-role callers.

### F-217 [P2] open - Self-service routes have no session or suspension check

**File:** `apps/web/src/app/api/account/profile/phone/route.ts:44-53` with `features/account/server/profile.ts:484-501`; `account/change-requests/route.ts:63-71`; `account/profile/route.ts:46-65`; `account/self/route.ts:28-32`
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** These take a client organization and are limited to the caller's own record, but read no suspension or session organization, and the phone route reads no membership. An Offboarded person keeps `user_id` on their row, so they can write their phone to that organization's record and add an audit row from another session, and someone suspended can file change requests that alert reviewers. Traced, not run.
**Suggested fix:** Use the session organization, or `requireOrgPermissions` with an own-record rule.
**Resolution:**
**Update 2026-11-07 (review):** `account/profile` (`route.ts:44-58`, `profile-change-requests.ts:833`) reads the role from the client's organization, so someone with a surviving Super Admin membership elsewhere renames their global profile directly, skipping the review their own organization requires. The rule that a manager edits directly should use the session's organization. Traced, not run.

### F-219 [P2] fixed - Losing sandbox rights locks the session out, and Exit can't fix it

**File:** `apps/web/src/app/api/test-sandbox/route.ts:45`; `apps/web/src/lib/api-auth.ts:414`; `apps/web/src/app/api/shared/permissions.ts:453`
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: quality)
**Why it matters:** A regression from F-198's repair. On the stack, after a demotion, `POST /api/test-sandbox { action: "exit" }` answered 403, and so did a read of the source organization, because the HttpOnly cookie stays and refuses every request. Only signing out clears it. The route's own comment says someone must always be able to leave. The exit test mocks this path. Another session's Enter deleting the sandbox should do the same, traced only.
**Suggested fix:** Authenticate `exit` without the sandbox rewrite, and clear the cookie when `findUsableSandbox` refuses it.
**Resolution:** Fixed on claude/sandbox-recovery (2026-11-12), as suggested: `/api/test-sandbox` authenticates every action with the token's own claims (`requireAuthenticatedUserWithTokenClaims`), so Exit always works, and a cookie that names no usable sandbox is refused with 403 `SANDBOX_ENDED` from `api-auth.ts` and `requireOrgPermissions`, a response that also clears it (`lib/sandbox-ended.ts`). The proxy clears it on a page load when the row is definitely gone; it had read the raw Cookie header, which carries the value encoded twice, so its sandbox check had never matched. The client reloads once into the real organization on that code and shows why, and the banner moved out of the header into the app shell so a billing or setup lock can't hide it. Enter reuses this session's sandbox only when it was cloned from the session's organization, and asks (409 `SANDBOX_OPEN_ELSEWHERE`) before replacing one open in another session. Route, auth and client tests cover a stale cookie, Exit with one, the reload, the ask and the cross-organization reuse; not run against a live stack.
**Update 2026-11-12 (claude/sandbox-followups):** sign-in no longer deletes every sandbox the person owns, only those whose auth session has ended or idled out (migration 136, `delete_ended_session_sandboxes`), so a second sign-in keeps a sandbox still open elsewhere, and Enter asks before replacing it. Inside a sandbox the header shows billing only to a Super Admin of the source organization (`sandboxSourceRole` on the bootstrap). `e2e/test-sandbox.spec.ts` covers enter, the banner, Exit with User view on, the replace warning and the ended notice.
**Update 2026-11-07 (review):** this got wider. Refusal now covers a person suspended in the source organization and a source that is archived or suspended, and `api-auth.ts:418` answers 403 on every claims route, bootstrap included, while `proxy.ts:624` doesn't re-check. Enter also checks rights on the session's organization but reuses `existing`, which can be another organization's clone (`test-sandbox/route.ts:99,112,128`), so after a switch it answers 200 and then everything answers 403. Sign-out and `POST /api/auth/organizations` still clear the cookie.

### F-220 [P3] open - Smaller regressions and fail-open checks from the session binding

**File:** see each item
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, quality)
**Why it matters:**

- Sandbox billing: `ignoreSandbox` leaves `redirectedToSandbox` false while the token names the source, so `GET /api/billing?orgId=<sandbox>` answered 403 on the stack and the header's billing notice goes.
- `permissions.ts:468` ignores the `employees` read error, so a failed read skips the suspension check. `canManageEmployees` throws instead.
- `readSessionOrgId` returns null on a failed re-verify (`api-auth.ts:262`), which skips the compare on the actor path.
- `employees/identity/route.ts:120-126` writes `email` on a linked row without `employees/manage`'s guard, so the staff row drifts until the daily repair job.

**Suggested fix:** Treat the sandbox as the session organization for billing, and fail closed on both reads.
**Update 2026-11-12 (claude/sandbox-recovery):** the sandbox billing item is fixed differently: the header and its billing notice ask `/api/billing` for the sandbox's source organization, as Billing settings already did, and a pending or refused billing read no longer holds the header inside a sandbox. The other items stay open.
**Resolution:**
**Update 2026-11-07 (review):** `permissions.ts:468` ignores every read error, not only the `employees` one: an `organizations` error skips the sandbox, archived and lock checks, and a `profiles` error skips deactivated. An attacker can't cause these reads to fail. Traced, not run.
**Update 2026-11-13 (re-check against dev):** (1) is fixed (the header asks billing for the source organization). (2), (3) and (4) are still open.
**Update 2026-11-13 (fix/p3-quick-wins):** (2) and (3) are fixed. `requireOrgPermissions` answers 503 (`SERVICE_UNAVAILABLE`, as `api-auth.ts` does for a failed read) and logs when the membership, profile, organization or employees read errors, instead of reading it as no row. `readSessionOrgId` returns the token's refusal when the re-verify fails, and `requireOrgPermissions` passes it on rather than skipping the session comparison. Tests in `permissions.test.ts` fail on the old code. (4), the identity route writing `email` on a linked row, is still open.

### F-221 [P3] open - Smaller gaps left around the repairs

**File:** see each item
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:**

- 122 leaves the `admin_write_*` FOR ALL policies, so one broad grant reopens F-197. `supabase/AGENTS.md:141` still recommends that grant, and 069 dropped its policies for this reason. Its comment at `122:9-11` is wrong: `members_select_*` in 035 already lets editors read drafts.
- Sessions moved into a sandbox before 123 stay there until cleanup, because 123 swept nothing and the token hook has no `workspace_kind` filter. Self-limiting within 14 days.
- Clones show internal QA staff, because `user_id` is stripped and `withoutHiddenStaff` no longer matches them (`features/test-sandbox/server.ts:150-158`).
- `account-deletion.ts:114,118`: with someone offboarded in two organizations, one Super Admin's delete removes the other organization's membership and clears its staff link. A leftover sandbox membership also wrongly blocks a delete.
- `validate_job_shift_override` sets `NEW.org_id` from the job (`002:7941`), so changing `job_id` as the service role moves a row past `refuse_org_id_change`. The composite keys still hold.

**Suggested fix:** Fix alongside F-198 and F-214.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. Since 136 keeps live sandboxes across sign-ins, a leftover sandbox membership blocks an account delete more often (item 4).

### F-222 [P2] unverified - Id arrays aren't bound to the organization

**File:** `jobs.focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids`; `organization_roles.department_ids, required_certification_ids`; `certifications.department_ids`; `employees.role_ids, focus_area_ids`
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security, multi-tenancy)
**Why it matters:** Arrays can't carry a foreign key, so F-192's repair doesn't cover them, and an Admin can write the `jobs` arrays through PostgREST. The eligibility SQL that was read ignores foreign ids, but other readers weren't traced. `employees/manage/route.ts:115-117` showed no organization check by grep. Whether production holds a cross-organization value is unknown.
**Suggested fix:** Check production with a read-only query, then validate these on write as `validate_department_ids` does.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** narrower than written: employees' `role_ids` and `focus_area_ids` are validated by `validateStaffOrgReferences`, and employee writes are server-only (065). The `jobs`, `organization_roles` and `certifications` arrays are still unchecked.

### F-223 [P3] fixed - Approving a request inside a Test Sandbox is refused

**File:** `resolve_shift_request_unchecked` (`117:517`); `auto_approve_shift_request` (`030:1506`)
**Found:** 2026-11-07 while fixing F-212
**Why it matters:** Both compare the request with `caller_org_id()`, and a sandbox session's token still names the source organization, so a tester can't approve or reject a request there. Run on the stack at 126: `is_own_sandbox_org` answered true, and `resolve_shift_request` raised. It predates this work and leaks nothing. It only limits what Test Sandbox can rehearse.
**Suggested fix:** Replace both checks with `is_authorized_org` the next time those functions are rewritten. The first is about 1,400 lines, too much to copy for this alone.
**Update 2026-11-07 (review):** `shift-request-settlement.ts:47` swallows `auto_approve_shift_request`'s refusal as `reason: "error"`. Migration 126's `refuse_caller_outside_org` comment also says a Gridmaster is held by `refuse_gridmaster_outside_org`, which `change_user_role` doesn't call; that is F-201's gap, not a new one.
**Resolution:** Fixed on claude/sandbox-followups (2026-11-12), as suggested: migration 135 copies `resolve_shift_request_unchecked` (from 117) and `auto_approve_shift_request` (from 030) unchanged apart from their organization check, which now calls `is_authorized_org` (the session's organization or its own sandbox, NULL-safe). Every caller runs as the signed-in user, so no tokenless path loses access. The live test in `session-bound-functions.integration.test.ts` has the owner reject a sandbox request and another session refused.

### F-225 [P2] fixed - A Super Admin keeps managing staff in a suspended organization

**File:** `apps/web/src/app/api/employees/shared.ts:130`; `packages/domain/src/billing.ts:99`
**Found:** 2026-11-07 by /audit (scope: repairs #397, #399, #401; lens: security)
**Why it matters:** `canManageEmployees` exempts Super Admins from `isLocked`, which is right for a billing lock but also covers an organization a Gridmaster suspended. Run through real HTTP: with the organization suspended, a live token created an invitation (200), while a route on `requireOrgPermissions` answered 403 for the same token. It predates this work.
**Suggested fix:** Refuse on `organization.suspended_at` in `canManageEmployees`, and keep the Super Admin exemption for billing only.
**Resolution:** Fixed on fix/route-permission-gaps (2026-11-13): `canManageEmployees` lets a Super Admin through a billing lock (to bring seats down) but not a suspension, matching `requireOrgPermissions`. Tested in `employees/shared.test.ts`: a suspended organization refuses its Super Admin, an `unpaid` one still admits them.

### F-226 [P3] fixed - `escapeLikePattern` leaves `*`, which PostgREST reads as `%`

**File:** `apps/web/src/features/employees/server/contact-conflicts.ts:16`; `apps/web/src/features/mobile/server/routes/people-contact-check.ts:14`; `features/employees/server/linked-email-repair.ts:126`
**Found:** 2026-11-07 by /audit (scope: repairs #397, #399, #401; lens: security, multi-tenancy)
**Why it matters:** Confirmed on the stack: `ilike.*a*` matched as a wildcard. The invitation route is safe because validation refuses `*`, but the mobile contact check doesn't validate its email, so a manager's `*@x.org` gets a false conflict and another employee's id, in their own organization only. Whether the repair job can see a `*` address depends on what Auth accepts, which wasn't checked.
**Suggested fix:** Escape `*` too, or compare `lower(email)` with `.eq`. Validate the email in the mobile check.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): `escapeLikePattern` escapes `*` too, so the contact check and the repair job can no longer send a wildcard. PostgREST maps every `*` to `%` without regard to the backslash, so an escaped `*` reaches Postgres as a literal `%`: an address that really contains `*` finds no match in the pre-flight (the unique index still refuses the save) rather than matching every address. The mobile contact check now applies the web check's rule (`z.string().trim().email()`) and skips the email lookup for an address it refuses, still answering the phone check. Tests in `contact-conflicts.test.ts` and `people-contact-check.test.ts` fail on the old code. The PostgREST mapping is from its source, not run on the stack.

### F-229 [P3] open - Someone suspended in their only organization can't accept an invitation to another

**File:** `sign_in_org_instead_of_default` (`127`); `apps/web/src/app/(app)/accept-invite/page.tsx:154`
**Found:** 2026-11-07 by /audit (scope: #405; lens: security, multi-tenancy)
**Why it matters:** The new membership doesn't exist until they accept, so the fallback finds nothing, the hook refuses them, and accepting needs a session. Traced, not run.
**Suggested fix:** Let an invitation's token carry them through acceptance without a session, or have the hook allow a session with no organization for this case.
**Resolution:**

### F-230 [P2] fixed - Android's tab layout drops the tab-level error boundary

**File:** `apps/mobile/app/(tabs)/_layout.android.tsx`; `apps/mobile/app/(tabs)/_layout.tsx:18` (`ErrorBoundary`)
**Found:** 2026-11-09 by /audit (scope: apps/mobile; lens: quality, platform divergence)
**Why it matters:** Expo Router takes a route's `ErrorBoundary` from the file it resolves, and on Android that is `_layout.android.tsx`, which exports none. A render error in any tab therefore reaches the root boundary on Android and replaces the whole app, where iOS shows "This tab ran into a problem" and keeps the providers alive, which is what the base file's comment promises. Found by comparing each platform file's exports with its base; it is the only mismatch among the 19 variants. The tab list itself (names, labels, order, role gates) is written three times, in the iOS, Android and web layouts, which is how the boundary was missed.
**Suggested fix:** Re-export `ErrorBoundary` from `_layout.android.tsx` (and `.web.tsx`). Then declare the tabs once (name, label, SF Symbol, Material icon, gate) in a shared module that each layout maps over, and add a test that every platform file exports what its base exports.
**Resolution:** Fixed on feature/56d-platform-consolidation (step 1, 2026-11-09): the tabs are declared once in `src/shared/navigation/app-tabs.ts`, every tab layout maps over it, and each re-exports `TabsErrorBoundary` from a shared module (a re-export from `./_layout` resolves to the Android file itself on Android). `platform-variants.test.ts` fails when any platform file exports less than its base, and failed on the old Android layout. On an Android 17 emulator a thrown render in Profile shows the tab error screen.

### F-231 [P2] fixed - Unit tests run the web fallbacks, so the iOS and Android code that ships is untested

**File:** `apps/mobile/vitest.config.mts` (resolves base files under the react-native-web shim); `apps/mobile/src/shared/components/ConfirmationModal.native.tsx`, `BottomSheetModal.native.tsx` and the 16 other `.ios`, `.android` and `.native` files
**Found:** 2026-11-09 by /audit (scope: apps/mobile; lens: quality, platform divergence)
**Why it matters:** Vitest resolves `ConfirmationModal.tsx`, the drawn card, so `ConfirmationModal.test.tsx` proves pending, duplicate-confirm and in-place error behaviour that no phone shows. On a device every word-only confirmation is `Alert.alert`, which closes when answered and reports a failure as a second alert with Try again. None of the 18 platform files (1,794 lines, every sheet, confirmation, toast, segmented switch and tab strip) has a test, and only `top-level-stack.ios.test.tsx` runs as a platform. A change to a shared primitive can pass every test and break both apps.
**Suggested fix:** Add Vitest projects for `ios` and `android` that put `.ios.tsx` or `.android.tsx`, then `.native.tsx`, ahead of `.tsx` in `resolve.extensions` and set `Platform.OS`, and run the primitives' tests in all three. Start with `ConfirmationModal.native.tsx`: move its button and message building into a pure, tested function.
**Resolution:** Fixed on feature/56d-platform-consolidation (steps 3 to 13, 2026-11-09), by removing most of what the tests could not reach rather than by adding iOS and Android Vitest projects: 13 platform files are folded into shared controls, so Vitest runs the code both phones ship for them. The five platform files left are tested directly: `ConfirmationModal.native.test.tsx` imports the native file with `Alert` mocked (cancel, destructive, a second action, dismiss as cancel, a failure as Try again, shown again on reopen), and the alert's buttons and message and the native sheet's opening size are pure tested functions (`confirmation-alert.ts`, `sheet-open-size.ts`); each test fails when its behavior is broken on purpose. Not done: a render test of `BottomSheetModal.native` through an `@expo/ui` shim.

### F-232 [P3] fixed - Screens build platform-specific navigation bar buttons themselves

**File:** `apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx:498-524` (`MarkAllReadBarAction`); `apps/mobile/src/features/people/components/PeopleHeaderActions.tsx:20-36`
**Found:** 2026-11-09 by /audit (scope: apps/mobile; lens: quality, platform divergence)
**Why it matters:** `HeaderTextBarAction`, `HeaderFilterAction` and `EditBarActions` keep the iOS and Android forms of a bar button in `shared/navigation`, but these two screens call `Stack.Toolbar` and `useToolbarIcon` directly and branch on `Platform.OS` (words on iOS, a Material icon on Android, waiting for the Android image). The next screen with a bar button will copy one of them.
**Suggested fix:** A shared `HeaderBarAction({ label, sfSymbol, materialIcon, placement, onPress })` that holds the platform choice and the image wait, used by both screens.
**Resolution:** Fixed on feature/56d-platform-consolidation (step 2, 2026-11-09): `HeaderBarAction` in `shared/navigation` holds the platform choice (words or the SF Symbol on iOS, the Material icon on Android once its image exists), and Mark all read and Add person use it. Neither screen imports `Platform` or `Stack.Toolbar`, and no file under `src/features` names `Stack.Toolbar`. Tested in `HeaderBarAction.test.tsx`; seen on the iOS Simulator and an Android 17 emulator.

### F-233 [P3] fixed - A searchable screen has to know where each platform draws its search field

**File:** `apps/mobile/app/_layout.tsx:48-56, 162` (`ALERTS_SEARCH_BAR`); `apps/mobile/src/features/people/screens/PeopleScreen.tsx:707-713` (`headerGap`)
**Found:** 2026-11-09 by /audit (scope: apps/mobile; lens: quality, platform divergence)
**Why it matters:** `ScreenSearch` hides the iOS bar against Android's docked field, but Alerts repeats its placeholder and an iOS check in the root layout (the route needs the bar before the push, or iOS 26 draws it over the title), and People adds a gap under the field on Android only. Each new searchable screen has to rediscover both.
**Suggested fix:** Export a `screenSearchRouteOptions(placeholder)` from `ScreenSearch` for the route, and give the Android field its own bottom spacing so screens set none.
**Resolution:** Fixed on feature/56d-platform-consolidation (step 11, 2026-11-09): `ScreenSearch` is `Stack.SearchBar` on both phones (the app-bar search action on Android, in DubGrid's colors), its `.android` docked bar is deleted, and it exports `screenSearchRouteOptions(placeholder, colors)` and `ALERTS_SEARCH_PLACEHOLDER` for the Alerts route, so no screen or layout repeats the placeholder or checks the platform. People's Android-only gap is gone. Seen filtering and clearing on an Android 17 emulator and unchanged on iOS 26.

### F-234 [P3] fixed - Small platform duplications outside the primitives

**File:** `keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}` in `Screen.tsx:347, 382`, `BottomSheetModalDrawn.tsx:315` and `features/auth/components/AuthShell.tsx:74`; inline prop types in `SelectionCheck.{ios,android}.tsx` and `SelectionCheckbox.ios.tsx`
**Found:** 2026-11-09 by /audit (scope: apps/mobile; lens: quality, platform divergence)
**Why it matters:** The keyboard rule is copied four times, one in a feature. The selection controls repeat their props in each platform file, where every other variant set shares a `.types.ts`, so their signatures can drift without a type error.
**Suggested fix:** One `KEYBOARD_DISMISS_MODE` constant in `screen-layout.ts`, and `SelectionCheck.types.ts` and `SelectionCheckbox.types.ts` like the other variants.
**Resolution:** Fixed on feature/56d-platform-consolidation (steps 4 and 14, 2026-11-09): one `KEYBOARD_DISMISS_MODE` in `src/shared/components/keyboard-dismiss.ts` serves `Screen`, the drawn sheet and `AuthShell`; the selection controls are single files, so their props can no longer drift. A monospace token and `features/profile/lib/device-copy.ts` took the remaining screen checks, and `design/no-platform-branch-in-mobile-ui` keeps `Platform.OS`, `Platform.select`, `Platform.Version` and platform-suffixed files out of `app/` and feature screens and components.

### F-235 [P3] open - Writing a draft cell answers two job questions before checking who is asking

**File:** `supabase/migrations/130_archived_jobs_stay_on_history.sql:91-105` (`write_schedule_cell_snapshot`)
**Found:** 2026-11-09 by /audit (scope: re-review of F-194 and F-224; lens: security, multi-tenancy)
**Why it matters:** `authenticated` can call the wrapper, and it runs `adds_shift_without_job` and `adds_archived_job` with owner rights before `write_schedule_cell_snapshot_any_kind` checks the caller. A signed-in user of any organization can pass another organization's id and a job id and read from the error whether that job is archived, or whether that organization has shifts without a job turned off. It writes nothing and reveals booleans only; job ids are sequential. `volunteer_for_open_shift` runs `refuse_caller_outside_org` first and is not affected. Traced and the grant confirmed on a local stack; not called cross-organization.
**Suggested fix:** Call `refuse_caller_outside_org(p_org_id)` (or the permission check) at the top of the wrapper, before the two job checks, in the next migration that touches it.
**Resolution:**

### F-236 [P3] open - Two Access suspended answers can show the wrong end date or none

**File:** `apps/web/src/app/api/auth/organizations/route.ts:75-79`; the access token hook (`supabase/migrations/128_web_session_idle_limit.sql:213-221`)
**Found:** 2026-11-09 by /audit (scope: re-review of F-224; lens: security, multi-tenancy)
**Why it matters:** Switching organization into one that suspended you answers `ACCOUNT_SUSPENDED` without `suspendedUntil`, though F-224's resolution says the route returns the date. And someone suspended at this address and in every other organization is refused with the date from their default organization's staff row, not this one's. Neither grants access; both can tell the person the wrong day. Read in code, not run.
**Suggested fix:** Return `suspendedUntil` from the switch route as the login route does, and have the hook name the date of the organization it refused for.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open. The hook can't know which organization the person asked for, so the login route should look up that organization's `suspended_until` itself.
**Update 2026-11-13 (fix/p3-quick-wins):** the switch half is fixed: `POST /api/auth/organizations` answers `suspendedUntil` for the organization being switched into, read from `switch_org`'s refusal, which since 127 names that organization's end date (the way the login route reads it); no extra query. `route.test.ts` covers it and fails on the old code. The web switcher doesn't show the date yet. Still open: the sign-in half, where the hook names the default organization's date; the login route, which should look up the requested organization's `suspended_until` itself, was out of this batch's reach.

### F-237 [P2] open - The People filter sheet doesn't open on Android

**File:** `apps/mobile/src/shared/navigation/HeaderFilterAction.tsx:30`; `apps/mobile/src/shared/components/BottomSheetModal.native.tsx` (Android path); `apps/mobile/src/features/people/screens/PeopleScreen.tsx:711`
**Found:** 2026-11-10 while restoring the native segmented switch
**Why it matters:** On the Android emulator, tapping People's Filter calls `onPress` (logged) and sets the sheet visible, but no sheet appears and nothing is logged. It happens with the drawn switch and the native one, and with People's search action removed from the bar, so neither causes it. iOS opens the same sheet. Only the emulator's development build was tried, not a release build or a phone, and other native sheets on Android weren't checked.
**Suggested fix:** Check whether any `BottomSheetModal.native` sheet opens on Android, then whether 56d's `sheetOpenSize` refactor changed the Android first render (it now reads `androidResizableRef` before setting it).
**Update 2026-11-13 (re-check against dev):** still unknown. Nothing since 2026-11-10 changed `HeaderFilterAction` or `sheet-open-size.ts`, and #506's People filter change wasn't run on Android.

### F-241 [P2] fixed - The mobile admin dashboard ignores Dashboard: View

**File:** `packages/mobile-api-core/src/dashboard.ts:604`; `apps/web/src/features/mobile/server/routes/dashboard.ts:83`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security)
**Why it matters:** It checks only that the caller is an Admin or Super Admin, while web's `/api/dashboard/analytics` requires `canViewDashboardAnalytics`. An Admin with every view off still gets org-wide coverage, every shift request in the range, publish history and staff hours on the phone. The comment assumes approvals default on; `ADMIN_DEFAULT_PERMS` has them off.
**Suggested fix:** Require the resolved `canViewDashboardAnalytics` (and per-section keys where web has them), and add a contract test that web and mobile refuse the same Admin.
**Resolution:** Fixed on fix/mobile-dashboard-permissions (2026-11-13), section by section rather than by refusing the dashboard, since web shows every Admin its dashboard and gates cards one at a time. The loader now takes the resolved permissions (`resolveDashboardSections`): pending approvals and the queue need `canApproveShiftRequests`, publishes in the activity feed need `canViewDashboardAnalytics`, sign-ups need `canManageEmployees`, and drafts (the draft summary, and drafts counted in coverage, open shifts and staff hours) need `canEditShifts`; without it the coverage summary reads published cells only. Request events cover the whole organization only for someone who can approve, edit shifts or edit staff, otherwise their own requests and open pickups, as web's request list does. Coverage, open shifts and staff hours stay for every Admin, as on web, where the schedule is always readable. A Super Admin keeps everything. The app hides the approvals card and figure for an Admin who can't approve, reading the bootstrap's permissions. Tests in `dashboard.test.ts` (package and route), `data.test.ts`, `DashboardHeroCard.test.tsx` and `AdminHomeScreen.test.tsx`; the package tests fail against the old loader. Not run on a device.
**Update 2026-11-13 (re-check against dev):** still open. Use the resolved `canViewDashboardAnalytics`, not the stored key.

### F-242 [P2] unverified - A non-approver Admin may get a request approved, and published, in an approver's name

**File:** `create_shift_request_unguarded` (099:98), `claim_shift_request` and `volunteer_for_open_shift` (130), `auto_approve_shift_request` (030:44-66); `apps/web/src/app/api/schedule/requests/route.ts:199`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security)
**Why it matters:** The database lets any Admin act for another employee with no permission key; the route narrows it to Schedule or Staff edit, but PostgREST calls skip the route. An Admin without approve or publish rights could file a call-off as an approver's employee row, and auto-approval would then publish it as that approver. Traced by a subagent, not run.
**Suggested fix:** Confirm on the stack. If it holds, require `canEditShifts` or `canManageEmployees` in the SQL for acting on someone else, and never auto-approve a request that someone other than the requester filed.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still unverified. Request functions were rewritten since (121, 126, 129, 135); start any fix from those.

### F-244 [P2] closed - An Admin never configured shows no permissions, and can't be edited on mobile

**File:** `apps/mobile/src/features/people/screens/PersonDetailScreen.tsx:1051-1055, 1811`; `apps/web/src/components/staff-detail/PersonInfoCards.tsx:177-189`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: UX)
**Why it matters:** Both gate on a stored set. For an Admin with `NULL` (F-239's common case), web drops the Permissions line and mobile hides the Permissions row, so a Super Admin on the phone has no way to set them.
**Suggested fix:** Gate on `orgRole === "admin"` and count from `buildInitialPermissions(stored)`.
**Resolution:** Fixed by migration 131 (`131_admin_permissions_complete.sql`), found by the 2026-11-13 re-check: a trigger stores a complete permission set for every Admin and backfilled existing ones, so the web Permissions line and the mobile Permissions row always show.

### F-246 [P3] open - Permission counts and change summaries disagree with the editor

**File:** `apps/web/src/components/staff-detail/PersonInfoCards.tsx:177, 191`; `access-management.ts:53-63` (`formatAdminPermissionsSummary`); `admin-permission-count.ts`; `access/route.ts:400` and `notifications/server/events.ts:1278`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: UX, quality)
**Why it matters:** Seen locally for the same Admin: the Access card reads "24 of 25" (raw stored keys, a total no Admin can reach) while the editor reads "16 of 16 turned on". The save review says "10 permissions enabled → 12", not which areas changed, so granting Staff: Edit looks like granting Reports. For a first edit of a `NULL` set, the alert, email and activity log list every standard permission as newly added.
**Suggested fix:** Count with `countPermissionLevels` everywhere, list each flipped area and level in the review and alert ("Staff: Edit on"), diff against `buildInitialPermissions(before)`, and remove the unused raw counter.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** the mobile count and the NULL first-edit diff are fixed (131). The web Access card's raw count, the review summary and alert diffs by raw key remain; drop the unused `adminPermissionCount` contract field.

### F-247 [P3] open - The editor hides the Recurring dependency, mobile shows no notes, and Select all grants Staff: Edit unchecked

**File:** `apps/web/src/components/PermissionsEditor.tsx:177, 282-288`; `apps/mobile/src/features/people/components/PermissionsSheet.tsx:97, 178-183`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: UX)
**Why it matters:** `impliedNote ?? mod.note` replaces "Applying to the grid and creating series also need Schedule: Edit." with "Included with Edit." whenever Recurring Edit is on, which is the default (seen locally). The phone sheet shows neither note, so "Included" and "Off" come with no reason, and swiping it down discards edits without asking. Select all turns on every switch, Staff: Edit included, in one click.
**Suggested fix:** Show both lines, warn inline when Recurring Edit is on without Schedule Edit, render notes on mobile, prompt before discarding, and leave Staff: Edit out of Select all (or confirm it).
**Resolution:**
**Update 2026-11-13 (re-check against dev):** the mobile sheet now asks before discarding (#469). The hidden Recurring note, notes on mobile and Select all granting Staff: Edit remain.

### F-248 [P3] fixed - Permission alerts and the activity log use a second, hardcoded vocabulary

**File:** `permission-labels.ts:18-23` (`PERMISSION_LABELS`)
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: quality, UX)
**Why it matters:** Alerts, email and the activity log say "Manage schedule areas" and "Manage repeating shifts", which match neither the editor's rows nor the organization's own term for focus areas (a standards rule).
**Suggested fix:** Derive these labels from `PERMISSION_MODULES` and the organization's labels.
**Resolution:** Fixed on fix/p3-quick-wins (2026-11-13): `PERMISSION_LABELS` is built from `PERMISSION_MODULES`, naming each flag by the editor row and level that sets it ("Staff: Edit", "Departments & labels: View"), with the three flags no row shows named the same way (Schedule: View, Staff: View, Organization settings: Edit). Several flags share a level, so the alert, email, activity log, access summary and Gridmaster card list each level once, and the alert reads "turned on Reports: View, and turned off Schedule: Edit". The row titles name no organization term (the focus-area term appears only in a row's description), and these callers don't hold the organization's labels, so nothing is customized per organization. Tested in `permission-labels.test.ts` and `audit-registry.test.ts`.

### F-249 [P3] open - Super Admins grant Super Admin and change permissions without fresh proof

**File:** `apps/web/src/app/api/organizations/access/route.ts:300-303`; `change_user_role` (053:95)
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security)
**Why it matters:** Fresh proof is required only of a Gridmaster. A stolen or left-open Super Admin session can mint another Super Admin (who then holds billing and can change the original's role) with no password or code. Step-up already guards credential changes and exports; granting authority is the same class.
**Suggested fix:** Require `requireSensitiveActionAuth` for any role change and any permission change that turns a switch on; the client already runs these through `useStepUpAction`.
**Resolution:**

### F-250 [P3] fixed - The server never applies the impersonation narrowing the app shows

**File:** `apps/web/src/app/api/shared/permissions.ts:563-567`; `packages/authz/src/index.ts:109-121`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security)
**Why it matters:** `buildPermissionContext` turns off staff, settings, approvals and notes while a Gridmaster impersonates, but `requireOrgPermissions` never passes `isImpersonating`, so routes grant all of it and only the client hides it. Part of F-201's gap.
**Suggested fix:** Pass the impersonation state into the resolver in `requireOrgPermissions` and the mobile auth context, with F-201.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** owner decision (2026-11-13): impersonating never narrows a Gridmaster's powers. Remove the narrowing from `buildPermissionContext` rather than applying it on the server, and remove the dead `skip: isImpersonating` branch in the requests route.
**Resolution:** Fixed on fix/impersonation-keeps-powers (2026-11-13), as decided: `buildPermissionContext` no longer turns off staff, settings, approvals, notes, user management or admin-permission editing while impersonating, so the app shows what the role can do and `isImpersonating` only marks the session. The dead `skip` option is gone from `settleShiftRequestAfterTransition` and the requests route; `auto_approve_shift_request` still never auto-approves for a Gridmaster (135), so "It's sent for approval" stays true.

### F-251 [P3] open - `departments.permissions` is written from client input and read by nothing

**File:** `supabase/migrations/001_schema.sql:257-262`; `apps/web/src/app/api/settings/config/route.ts:2406`; `apps/web/src/lib/db/employees.ts:71`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: quality)
**Why it matters:** The column's comment still says it "defines what members can do", the settings route stores whatever the client sends, and nothing reads it. A future change that trusts it would grant permissions from data anyone with Departments: Edit can write. Beside the Access card's "Administrative Teams" line, it also suggests teams grant something.
**Suggested fix:** Drop the column (or at least stop writing it and fix the comment) in a forward migration.
**Resolution:**
**Update 2026-11-13 (re-check against dev):** still open; the `mgmt_permissions_only` CHECK constraint goes with the column.
