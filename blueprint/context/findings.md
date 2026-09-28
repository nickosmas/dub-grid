# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-18 [P3] unverified - The live MFA-policy integration test can lose its verified session under full-suite load

**File:** `apps/web/src/__tests__/mfa-enforced-in-policies.integration.test.ts:110`
**Found:** 2026-09-25 during 41b3's final gate (full `npm run test`)
**Why it matters:** The challenge verify returned no session once in a full run and passed in isolation (1/1). A TOTP window rollover or local Auth rate limit under parallel live tests are the likely causes; unproven.
**Suggested fix:** Generate the code for the verify moment and retry once on a window edge, or run the live tests serially.
**Resolution:**

### F-62 [P2] open - Turning on `secure_password_change` would refuse password changes for two-factor users on sessions older than a day

**File:** `apps/web/src/features/account/client/step-up.ts:44`; `apps/mobile/src/features/profile/lib/step-up.ts:62`; `supabase/config.toml` (`secure_password_change = true`)
**Found:** 2026-09-26 during 41d3's production Auth review
**Why it matters:** Supabase Auth v2.187.0 (`internal/api/user.go:154`) refuses a password update without a reauthentication nonce when the current session started more than 24 hours ago. DubGrid's password step-up replaces the session, so it passes; its authenticator-code step-up keeps the old session, and neither app sends a nonce. Mobile sessions now last until sign-out, so with the setting on, a two-factor user could not change their password on mobile after the first day. Production has it off; local `config.toml` has it on, which the fresh sessions in tests never reach.
**Suggested fix:** Keep it off in production. Before turning it on, either send Supabase's reauthentication nonce with the update or have the authenticator-code step-up issue a fresh session; then set local and production alike.
**Resolution:**

### F-75 [P3] open - Database functions still let a stale Gridmaster token edit organization data

**File:** `supabase/migrations` (`check_admin_permission_for_org`, `is_authorized_org`, `publish_schedule` and the schedule, recurring and request functions that use them; `start_impersonation`; `force_logout_user`)
**Found:** 2026-09-26 while building 41d6
**Why it matters:** These SECURITY DEFINER functions are granted to `authenticated` and authorize a Gridmaster with `is_gridmaster()` alone, so a stale or stolen Gridmaster token can still edit schedules, publish, and settle requests in any organization by calling them through the data API. `start_impersonation` called directly also starts a session and its in-app notices without the route's audit row and email notice, and `force_logout_user` is gated in its route but not in the database. They are also how impersonated edits work, through routes that do not ask for fresh proof.
**Suggested fix:** A decision for the owner. Requiring `caller_has_fresh_proof()` for a Gridmaster in those checks closes it, but a Gridmaster editing schedules while impersonating would then be asked to confirm their identity every five minutes, and the schedule screens would need the step-up prompt wired in. Alternatively accept it: grants of authority and direct table writes are already closed (051 to 054).
**Resolution:** Narrowed by the owner's choice (2026-09-26, 41d7): migration 055 gives `start_impersonation` and `force_logout_user` the 051 guard, the impersonation route asks for fresh proof before a start (never before an end) and answers a database refusal with the prompt, and the portal runs the start through step-up; live tests prove both refuse a stale Gridmaster, work with fresh proof, and that a stale token still ends a session. Still open: the schedule, recurring, publish and request functions, left unchanged on purpose because fresh proof there would interrupt impersonated editing.

### F-78 [P3] fixed - A mobile sign-in that outlives the app's request timeout leaves an orphan server session

**File:** `apps/mobile` sign-in request (15 s client timeout); `apps/web/src/app/api/auth/login/route.ts`
**Found:** 2026-09-26 during the 41d3 Android rehearsal
**Why it matters:** On a slow server (18.6 s observed under load) the phone gives up while the server finishes, so a session is created that the phone never receives, and Security lists an extra signed-in device until it is revoked or expires.
**Suggested fix:** End the created session when the client has gone (for example, a short server-side deadline that signs the new session out), or let the next successful sign-in on that device replace the orphan.
**Resolution:** Fixed in f3eb3fe0 (fix/mobile-login-orphan-session), taking the first option. The mobile login handler is `apps/web/src/features/mobile/server/routes/auth-login.ts`, not the web route the finding names. Past `MOBILE_LOGIN_SERVER_DEADLINE_MS` (the client timeout less one second), or once `req.signal` reports the client gone, it ends the session it just created and answers 504 rather than returning tokens nobody is waiting for; returning them is what leaves the orphan, so the two are decided together. The ending is `endUserSession` with the user and session ids read back from the token just minted, never a `signOut` on the ephemeral client, whose default global scope would sign the person out on every device. Cleanup is best effort and its outcome is recorded as `sessionDiscarded`, since a sign-in already too slow to use must not also fail on tidying up. `MOBILE_REQUEST_TIMEOUT_MS` moved into `@dubgrid/contracts` because the server has to stay under the client's value and two copies would drift. The handler now changes a session, so `MOBILE_DELEGATES` classifies it with assertions pinning that the only session it can end is the one it just created for that request; a sensitive-action gate would be circular on the endpoint that mints the caller's first token (the findings session agreed). Three route tests cover the abandoned sign-in, a cleanup failure still answering 504, and a normal sign-in ending nothing. Not verified against a real slow server: the 18.6 s case came from a loaded Android rehearsal and was not reproduced.

### F-102 [P3] closed - Two-factor reset follow-ups

**File:** `apps/web/src/emails/TwoFactorResetEmail.tsx:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.ts:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.test.ts:14`; comments at `terminate/route.ts:71` and `gridmaster/users/route.ts:225`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-90
**Why it matters:** a partial reset still emails "signed you out everywhere" although `endUserSessions` never ran; the re-enrollment flag is set before any factor is removed, so a failure in `listFactors` leaves the person gated to re-enroll with no record or email; no test makes the profile update or `endUserSessions` fail after every factor is gone; two comments still describe watermark-only revocation.
**Suggested fix:** a `partial` prop with softer wording; set the flag after the first removal, or record the attempt; the two failure tests; refresh the comments.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 3): `TwoFactorResetEmail` takes `partial`, and a partial reset's notice says some devices may still be signed in and asks the person to sign out of any they don't recognize, never "everywhere"; the route passes `partial` to the notice. `resetPersonTwoFactor` lists factors before setting the re-enroll flag, so a failed list changes nothing, while the flag still precedes every removal. Tests cover the failed list, a failed two-factor switch-off and a failed session ending after both factors are gone (each a partial error counting 2), and both email wordings; the old helper and email fail them. The stale comment in `gridmaster/users/route.ts` now describes `endUserSessions`; the terminate route's was replaced under F-101 by its own session. Closed 2026-09-28 by `/audit` of 2a02d54c: the reset lists factors before the flag and flags before any removal; the partial notice's wording never says "everywhere" and the route passes `partial` only on `PartialTwoFactorResetError`; the three failure paths and both wordings are tested.

### F-103 [P3] closed - Each step-up-refused status change is sent three times, and a bulk can partly apply

**File:** `apps/web/src/components/staff/useSharedStepUp.tsx:21`; `apps/web/src/hooks/useStepUpAction.tsx:43`; `apps/web/src/app/api/employees/status/route.ts:61`; `apps/web/src/app/api/employees/status/route.test.ts:163`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** the refused first send, then `stepUp.run`'s own attempt with the current token before it prompts, then the retry: three requests per row against `apiLimiter` (10 per 10 s), which the route checks before the gate. A Gridmaster's bulk of five or more confirmed quickly can hit 429 on the last retries and apply only part of the batch, which F-98's quiet-cancel counting then reports as done (unverified in a browser). The status route test covers only `deactivate`, not `remove`, `activate` staying ungated, or a Gridmaster with fresh proof going on to write.
**Suggested fix:** a "prompt now" entry on `useStepUpAction` that skips the first attempt, bounded bulk concurrency, `toHaveBeenCalledTimes` in `useSharedStepUp.test.tsx`, and the three route cases.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 4, on c6dfdb51): `useStepUpAction` gains `prompt(action, method)`, which opens the dialog at once; `useSharedStepUp` uses it after a refusal, so a refused row is sent twice (the refusal, then the assured retry) and never three times. The bulk runs its status changes through `mapInBatches` three at a time. Tests: call counts in `useSharedStepUp.test.tsx`, `prompt` asking before any send, a five-person bulk never exceeding three in flight, and in the status route a Gridmaster's removal gated, reactivation ungated, and a fresh Gridmaster going on to the record. Reverting the hook or the bulk fails them. Closed 2026-09-28 by `/audit` of 2a02d54c: `prompt` shares `run`'s guard and cleanup through `waitForProof`, so existing callers are unchanged; `useSharedStepUp` prompts at once after the refusal (two sends per refused row, asserted); the bulk runs through `mapInBatches` three at a time and still reports each result, so F-98's counting holds; the route's remove, activate and fresh-proof cases are tested.

### F-104 [P3] closed - Consent-row device labels over-claim the DubGrid app

**File:** `apps/web/src/lib/user-agent-label.ts:13`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** any CFNetwork and Darwin client (a Mac app, an iPad, any iOS app) reads "DubGrid app on iPhone", and any `okhttp/` client "DubGrid app on Android", on rows kept as consent evidence from a client-set header; the card says "Mac" and "Windows" where the sessions list says "Macintosh" and "Windows PC".
**Suggested fix:** require the app's own `DubGrid/` token before naming the app, fall back to a neutral label, and share one vocabulary with the sessions list.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 1): the app is named only for an agent starting with the iOS app's own `DubGrid/` bundle token; any other CFNetwork agent reads "iPhone or iPad app" and `okhttp/` reads "Android app". Decision (owner delegated, 2026-09-28): keep the owner's F-96 wording "Safari on Mac" rather than the sessions list's "Macintosh"; the two lists keep their own vocabularies. Tests cover all three native agents; the old helper fails them. Closed 2026-09-28 by `/audit` of 2a02d54c: the app is named only for a `DubGrid/` agent and other native agents read neutrally. Keeping "Mac" over the sessions list's "Macintosh" is recorded as the owner-delegated decision.

### F-105 [P3] closed - The person history's detail stripping is a narrow denylist, and two edge cases drop events

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:163`, `:237`, `:100`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-85 and F-87
**Why it matters:** no leak today (every current writer puts IP and user agent in columns and only the three hash keys in `details`), but only three top-level keys are removed, so a later writer adding `ipHash`, `userAgent` or a nested hash would reach the history and its export; the F-87 filter compares `actor_id` to a `userId` the route accepts in any case, so an uppercase id would drop the person's own impersonation actions (unverified, clients send lowercase); an impersonation older than the newest 500 sessions is now missing rather than duplicated (`truncated` is set).
**Suggested fix:** strip keys matching a hash, IP or user-agent pattern at any depth (or an allowlist per action), lowercase the id at the route, and say in the card when the session list was capped.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 2): `withoutNetworkDetails` now drops, at any depth of `details` (objects and arrays), every key whose name ends in `hash`, is `ip`, starts with `ipaddr` or contains `useragent` once case, `_` and `-` are ignored; `loadPersonHistory` lowercases a user target's id before querying and before the F-87 comparison. The cap needed no change: the card already warns the history is partial whenever any source, the impersonation sessions included, returned its full read. Tests with nested and renamed keys and an uppercase id fail against the old code. Closed 2026-09-28 by `/audit` of 2a02d54c: network keys are dropped at any depth and the account id is lowercased before the F-87 comparison. Every current writer (`employees/identity`, `employees/manage`, `employees/status`, `organizations/access`) stores the IP in the `ip_address` column, which is dropped too; a future camelCase key such as `clientIp` would not match, which no writer uses today.

### F-110 [P3] closed - The person page's request lists do not say they stop at 90 days

**File:** `apps/web/src/components/gridmaster/person/PersonScheduleSection.tsx:167`, `:195`; `apps/web/src/features/gridmaster/server/person-activity.ts:117`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; all lenses)
**Why it matters:** "Shift requests" has always shown open requests plus the last 90 days, and since F-92 "Profile change requests" does too (before, it listed every one ever made), but neither title says so, unlike "Publish changes, last 90 days". A Gridmaster looking for an older resolved request reads an empty list as "none".
**Suggested fix:** Title both groups "..., open and last 90 days", or keep profile change requests unbounded (they are few) and label only shift requests.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 1): both groups are titled "…, open and last 90 days", matching "Publish changes, last 90 days". Closed 2026-09-28 by `/audit` of 2a02d54c: both request groups read "…, open and last 90 days", and the section test finds them by those titles.

### F-111 [P3] closed - Migration 066 has no live test

**File:** `supabase/migrations/066_person_history_target_index.sql`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: tests)
**Why it matters:** `gridmaster_user_emails` returns any account's email and is safe only because of its grants. The refusal for `anon` and `authenticated` and the index plan were proven by hand in a rolled-back transaction, but nothing re-checks them, unlike 063 and 064, which run from their files in live tests. A later broad grant would expose every email silently.
**Suggested fix:** A live test that runs 066 from its file in a rolled-back transaction and asserts `has_function_privilege` is false for `anon` and `authenticated` and true for `service_role`, and that the function returns a seeded user's email.
**Resolution:** Fixed in fix/migration-066-live-test: `migration-066-person-history.integration.test.ts` runs 066 from its file inside a rolled-back transaction (taking `audit_log`'s share lock first) and asserts that only `service_role` may execute `gridmaster_user_emails`, that an `authenticated` call is refused, that it returns a seeded account's email and nothing for an unknown id, and that the history's OR plans through `idx_audit_log_details_target_user` with sequential scans off. A copy of 066 granting `authenticated` fails two cases; one without the index fails the plan case. Passes alone and in the full `test:web` (5,209). Closed 2026-09-28 by `/audit` of 19e2e61a (in the ledger at 2a02d54c): the live test runs 066 from its file under a share lock, asserts the three grants, the refused signed-in call, the lookup and the index plan, and failed against a copy granting `authenticated` and one without the index.

### F-112 [P3] invalid - Migration 066 locks `audit_log` writes while its index builds

**File:** `supabase/migrations/066_person_history_target_index.sql:15`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: performance)
**Why it matters:** `CREATE INDEX` without `CONCURRENTLY` blocks inserts into `audit_log` for the length of the build, and every audited action writes there. Harmless at today's sizes, but production's row count was not measured.
**Suggested fix:** Read production's `audit_log` row count (read-only) during the release rehearsal and time the build on the scratch stack; if it is more than a few seconds, build the index `CONCURRENTLY` outside the migration transaction.
**Resolution:** 066 applied to production 2026-09-28 in one statement with no measured stall: production's `audit_log` held about 230 rows (248 kB), a read-only count taken by the person-page session, so the build locked writes for a negligible time and no `CONCURRENTLY` split was needed. Left `unverified` for `/audit` to settle; a later large-table index would need the concurrent build. Re-examined 2026-09-28 by `/audit`: production's `audit_log` held about 230 rows (248 kB) when 066 was applied, so the build's write lock was negligible; the risk does not hold at this size, and a future large-table index would need its own `CONCURRENTLY` plan.

### F-120 [P3] fixed - The docs tests miss the error paths and assert loosely

**File:** `apps/web/src/__tests__/docs-contract.test.ts`; `apps/web/src/__tests__/docs-inventory.test.ts:419`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; lens: tests)
**Why it matters:** untested: duplicate id or route, unknown surface, missing rationale, verified page without a fingerprint, fingerprint mismatch, unregistered or missing page, nested nav groups, and `checkDocumentationContract` end to end. The first contract test compares only the set of rule names, the `requireClosed` test never shows a closed contract passing, and "classifies environment names without reading values" never asserts the value is absent from the output.
**Suggested fix:** add those cases, including the fixtures behind F-114 to F-118, assert exact diagnostics, and assert the example value is absent from `renderInventoryJson`.
**Resolution:** Fixed across 40a steps 4 to 6: fixture cases for each contract rule, the unclassified script and job, every env read form, `ALTER TABLE ONLY` and multi-table drops, a contract that genuinely closes, exact diagnostic lists, and the env value's absence; each new rejection case fails against the previous scripts. The re-review found gaps left (a valid lifecycle used as the invalid case, untested unknown surface, missing rationale, missing fingerprint, missing file and nested navigation); a follow-up test now asserts each with an exact diagnostic list. `checkDocumentationContract` end to end remains covered only by the real `docs:check` run.

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
**Resolution:**

### F-126 [P3] open - Faker's code-execution advisory waits on @snaplet/copycat

**File:** `package-lock.json` (`node_modules/@snaplet/copycat/node_modules/@faker-js/faker` 8.4.1); `scripts/audit-check.mjs` allowlist; Dependabot alert 175
**Found:** 2026-09-28 while clearing the open Dependabot alerts
**Why it matters:** `faker.helpers.fake()` evaluates its template (GHSA-qxc2-j82w-r537, fixed in 10.5.0). Faker arrives only through the seed tooling (`@snaplet/seed` > `@snaplet/copycat`), whose templates we write, and nothing calls `helpers.fake` with outside input. copycat 6.0.0 is still its newest release and pins faker ^8.4.1, two majors below the fix.
**Suggested fix:** Take a copycat release on faker 10.5 or later when one ships, or replace the seed data generator. The allowlist entry holds until 2026-12-01.
**Resolution:**
