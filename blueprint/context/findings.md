# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-05 [P3] open - The password-change audit label is client-reported, and a failed sign-out leaves no record

**File:** `apps/web/src/lib/auth/session-sign-out.ts:28`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Any assured user can record "Changed their password" on a global sign-out without changing anything, and a password change whose sign-out fails is not recorded at all. No access is gained either way.
**Suggested fix:** Record the change independently of the client, which is the F-08 decision; until then the label is client-reported.
**Resolution:**

### F-18 [P3] unverified - The live MFA-policy integration test can lose its verified session under full-suite load

**File:** `apps/web/src/__tests__/mfa-enforced-in-policies.integration.test.ts:110`
**Found:** 2026-09-25 during 41b3's final gate (full `npm run test`)
**Why it matters:** The challenge verify returned no session once in a full run and passed in isolation (1/1). A TOTP window rollover or local Auth rate limit under parallel live tests are the likely causes; unproven.
**Suggested fix:** Generate the code for the verify moment and retry once on a window edge, or run the live tests serially.
**Resolution:**

### F-20 [P3] open - Saving notification preferences can lose a concurrent save

**File:** `apps/web/src/features/account/server/preferences.ts:31`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** The save reads, merges and upserts in three steps, so a mobile save and a web save at the same moment can drop one another's change. Before 41c1 a mobile save erased the web categories every time.
**Suggested fix:** Merge inside the database (`prefs = notification_preferences.prefs || excluded.prefs` in an RPC), which needs a migration.
**Resolution:**

### F-25 [P3] open - The once-per-session sign-in record is not atomic

**File:** `apps/web/src/lib/auth/sign-in-completion.ts:61`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Two concurrent completion calls can both read nothing and both write. The app's clients guard concurrent calls.
**Suggested fix:** A partial unique index on `(actor_id, details->>'sessionHash')` for successes, which needs a migration.
**Resolution:**

### F-26 [P3] open - Two concurrent impersonation ends can both be recorded

**File:** `apps/web/src/app/api/gridmaster/impersonation/route.ts:205`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The row is read before `end_impersonation`, whose second call is a silent no-op, so both requests write `impersonation.ended`.
Since 41c3 the route also sends the end notice, so a concurrent pair sends two emails as well.
**Suggested fix:** Have the RPC return whether it ended a row (migration).
**Resolution:**

### F-50 [P3] open - Remaining drift-guard gaps

**File:** `apps/web/src/__tests__/invitation-sql-contract.test.ts:41`; `access-token-hook-claims.test.ts`; `apps/web/src/emails/InviteEmail.tsx:72`; `apps/web/src/app/page.tsx:93`; `apps/web/src/__tests__/push-auth-templates.test.ts`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** The SQL messages are copied into the test rather than read from the route; `VerifiedClaims` and the api-auth `Claims` (which add `in_sandbox`) are not in the claim check; the 72 hours in invite and landing copy is not tied to `INVITATION_LIFETIME_HOURS`; the new tests assume they run from `apps/web`; and the push test mirrors the script's Management API field names, so a wrong name would pass.
**Suggested fix:** Read the matched strings from the route; add `VerifiedClaims` with an `in_sandbox` allowance; derive the copy from the constant; use `supabaseMigrationsDir()`-style root resolution; check field names against the Management API schema in 41d3.
**Resolution:**

### F-62 [P2] open - Turning on `secure_password_change` would refuse password changes for two-factor users on sessions older than a day

**File:** `apps/web/src/features/account/client/step-up.ts:44`; `apps/mobile/src/features/profile/lib/step-up.ts:62`; `supabase/config.toml` (`secure_password_change = true`)
**Found:** 2026-09-26 during 41d3's production Auth review
**Why it matters:** Supabase Auth v2.187.0 (`internal/api/user.go:154`) refuses a password update without a reauthentication nonce when the current session started more than 24 hours ago. DubGrid's password step-up replaces the session, so it passes; its authenticator-code step-up keeps the old session, and neither app sends a nonce. Mobile sessions now last until sign-out, so with the setting on, a two-factor user could not change their password on mobile after the first day. Production has it off; local `config.toml` has it on, which the fresh sessions in tests never reach.
**Suggested fix:** Keep it off in production. Before turning it on, either send Supabase's reauthentication nonce with the update or have the authenticator-code step-up issue a fresh session; then set local and production alike.
**Resolution:**

### F-73 [P2] fixed - Production Supabase accepts public sign-ups on an invite-only product

**File:** `supabase/config.toml:165` (`enable_signup = true`); production auth config (`disable_signup: false`, read 2026-09-26)
**Found:** 2026-09-26 during the email review (read-only Management API read)
**Why it matters:** `internal/authentication.md` and `RBAC_SYSTEM_DESIGN.md` say email sign-up is off in production, but it is on. Anyone with the public publishable key can create and confirm an account through `/auth/v1/signup`, or through a sign-in link request, which also creates a missing user while sign-ups are open. The account has no organization, so RLS should still hide tenant data, but every RPC granted to `authenticated` becomes reachable by strangers.
**Suggested fix:** Set `disable_signup: true` on production (dashboard or Management API). Only `/api/invitations/register` creates accounts, through `auth.admin.createUser`, which ignores the setting. Local `config.toml` stays open for the integration tests that call `signUp`. Consider having `auth:templates:check` report the setting so it cannot drift again.
**Resolution:** Production set to `disable_signup: true` through the Management API on 2026-09-26 (read back true; email sign-in and confirmation unchanged). Local `config.toml` stays open for the integration tests. The drift check in `auth:templates:check` is not added yet.

### F-75 [P3] open - Database functions still let a stale Gridmaster token edit organization data

**File:** `supabase/migrations` (`check_admin_permission_for_org`, `is_authorized_org`, `publish_schedule` and the schedule, recurring and request functions that use them; `start_impersonation`; `force_logout_user`)
**Found:** 2026-09-26 while building 41d6
**Why it matters:** These SECURITY DEFINER functions are granted to `authenticated` and authorize a Gridmaster with `is_gridmaster()` alone, so a stale or stolen Gridmaster token can still edit schedules, publish, and settle requests in any organization by calling them through the data API. `start_impersonation` called directly also starts a session and its in-app notices without the route's audit row and email notice, and `force_logout_user` is gated in its route but not in the database. They are also how impersonated edits work, through routes that do not ask for fresh proof.
**Suggested fix:** A decision for the owner. Requiring `caller_has_fresh_proof()` for a Gridmaster in those checks closes it, but a Gridmaster editing schedules while impersonating would then be asked to confirm their identity every five minutes, and the schedule screens would need the step-up prompt wired in. Alternatively accept it: grants of authority and direct table writes are already closed (051 to 054).
**Resolution:** Narrowed by the owner's choice (2026-09-26, 41d7): migration 055 gives `start_impersonation` and `force_logout_user` the 051 guard, the impersonation route asks for fresh proof before a start (never before an end) and answers a database refusal with the prompt, and the portal runs the start through step-up; live tests prove both refuse a stale Gridmaster, work with fresh proof, and that a stale token still ends a session. Still open: the schedule, recurring, publish and request functions, left unchanged on purpose because fresh proof there would interrupt impersonated editing.

### F-78 [P3] open - A mobile sign-in that outlives the app's request timeout leaves an orphan server session

**File:** `apps/mobile` sign-in request (15 s client timeout); `apps/web/src/app/api/auth/login/route.ts`
**Found:** 2026-09-26 during the 41d3 Android rehearsal
**Why it matters:** On a slow server (18.6 s observed under load) the phone gives up while the server finishes, so a session is created that the phone never receives, and Security lists an extra signed-in device until it is revoked or expires.
**Suggested fix:** End the created session when the client has gone (for example, a short server-side deadline that signs the new session out), or let the next successful sign-in on that device replace the orphan.
**Resolution:**

### F-82 [P3] fixed - Month view misses a note filed under a person's secondary focus area

**File:** `apps/web/src/components/MonthView.tsx` (row building)
**Found:** 2026-09-26 by review of 42a
**Why it matters:** A general shift code is listed only under the person's primary focus area, so an indicator stored against another of their focus areas for that day never appears in the day popover. Rare: indicators are normally stored against the focus area the shift is in.
**Suggested fix:** Merge the person's marks from their other home focus areas into that row, deduplicated.
**Resolution:** Fixed: after building a day's rows, each person's first row also takes the notes filed under every focus area they have no row in that day, and those with no focus area, each note once (`MonthView.tsx`). A test lists a general-code person under their primary area with a note filed under their second area and a note filed under both; it fails against the previous code.

### F-83 [P3] fixed - Gridmaster realtime invalidation is not coalesced

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts`
**Found:** 2026-09-26 by review of the findings batch
**Why it matters:** The platform-wide subscription invalidates on every row event with no debounce, so a bulk import or invitation batch in any organization restarts an open person page's (and the platform summaries') fetch once per row. Gridmaster-only, and the summaries already behaved this way.
**Suggested fix:** Coalesce invalidations per query key over a short window before refetching.
**Resolution:** Fixed in `fix/gridmaster-realtime-coalesce`: the Gridmaster subscription batches its invalidations by query key through the shared `createDebouncedTableFlusher` (150 ms, as the org hook), so each distinct key refetches and broadcasts once per burst, and a pending batch is dropped on teardown. Tests cover the burst, cross-table dedupe, the live subscription and teardown.

### F-84 [P3] fixed - No index serves an organization's schedule notes by date

**File:** `supabase/migrations/001_schema.sql` (`schedule_notes` indexes)
**Found:** 2026-09-27 by review of 42b
**Why it matters:** The web schedule and, since 42b, every mobile team schedule read notes by `org_id` and a date range, ordered by date; with only `(org_id)`, `(emp_id)`, `(emp_id, date)` and `(indicator_type_id)` indexes, that scans the organization's whole note history. Fine at today's sizes.
**Suggested fix:** A forward migration adding an index on `(org_id, date)`.
**Resolution:** Fixed: migration `062_schedule_notes_org_date_index.sql` adds `idx_schedule_notes_org_date` on `(org_id, date)` and drops the single-column `idx_schedule_notes_org` it covers; checksum locked and `db:migrations:check` passes. Applied locally, where a week's read for an organization now plans as an index scan on the new index. Applied to production 2026-09-27 by the owner after a scratch rehearsal from 061 and on the local stack. Before: 61 ledger entries, only 062 missing. After: 62 ledger entries, none missing, every invariant passing, health 200, and a final dry run up to date. Shipped in release #120.

### F-85 [P2] fixed - The Gridmaster history returns IP, email and session hashes, and the export writes them out

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:162`
**Found:** 2026-09-27 by `/audit` (scope: item 43, 54f5c12d..43327601; all lenses)
**Why it matters:** `withoutNetworkDetails` strips only the `ip_address` and `user_agent` columns. The person's own `security.auth.*` rows keep `sourceHash` (a hashed client IP), `targetHash` and `sessionHash` in `details`, which the history GET and both export routes return raw. The person record's rule is never to carry IP hashes.
**Suggested fix:** drop those three keys from `details` in `loadPersonHistory` (or allowlist details keys), with a merge test row that carries them.
**Resolution:** Fixed in fix/person-page-findings (Step 1): `loadPersonHistory` drops `sourceHash`, `targetHash` and `sessionHash` from every row's `details` beside the network columns, so the history GET and both exports never carry them; a merge test row with all three comes back without them.

### F-86 [P2] fixed - Person notifications return the IP address and session id stored on new-device alerts

**File:** `apps/web/src/features/gridmaster/server/person-notifications.ts:37`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `security_new_device` writes an email-channel row whose `metadata` holds `ipAddress` (`events.ts:1080`) and `dedupe_key: "security_new_device:<session id>"` (`sender.ts:289`). The loader returns `metadata` verbatim to the Gridmaster page.
**Suggested fix:** allowlist the metadata keys the card needs (or drop `ipAddress` and `dedupe_key`), with a test using a new-device row.
**Resolution:** Fixed in fix/person-page-findings (Step 1): `loadPersonNotifications` keeps only an allowlist of descriptive metadata keys (platform, device label, browser, city, country, time, `email_sent`); `ipAddress`, `dedupe_key` and unknown keys are dropped. A new-device row test proves it.

### F-87 [P2] fixed - Every impersonation appears twice in a person's history

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:116`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the account source drops `impersonation.started`/`.ended` about the person, but the staff source (`fetchEmployeeAuditRows` with every action) still matches them through `details->>targetUserId` in the target organization. Their numeric ids never collide with the string `impersonation-<id>` row, so both show, against the one-entry-per-event rule. The merge test gives the staff query no impersonation rows.
**Suggested fix:** apply the same drop (action in the pair and actor is not the person) to the merged rows in `loadPersonHistory`, with a merge test.
**Resolution:** Fixed in fix/person-page-findings (Step 2): `loadPersonHistory` drops `impersonation.started` and `.ended` rows whose actor is not the person from every source after the merge, so the session row is the one entry. A merge test with both rows in the staff source shows one entry and fails without the filter.

### F-88 [P2] fixed - History, export, notifications and force logout do not refuse a Gridmaster target

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:186`; `person-notifications.ts:14`; `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:61`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the person record (`person-record.ts:323`) and every write through `loadPersonTarget` refuse a Gridmaster account, but these read another Gridmaster's whole audit history, export it, or read their inbox by id; force logout (older, but on the same page) acts on one too.
**Suggested fix:** return null for `platform_role = 'gridmaster'` in `loadPersonHistory`, use `loadPersonTarget` in the notifications and force-logout routes, and add a refusal test per route.
**Resolution:** Fixed in fix/person-page-findings (Step 2): `loadPersonHistory` returns null for a Gridmaster account, directly or through a staff record linked to one, so history and export answer 404; the notifications route loads the target through `loadPersonTarget` and answers 404 before reading. Force logout is left as it is: the Gridmaster accounts screen uses it on purpose to sign out another Gridmaster, so that part of the finding did not hold.

### F-89 [P2] fixed - Deactivating or terminating an account leaves its refresh tokens alive for reactivation

**File:** `apps/web/src/app/api/gridmaster/users/route.ts:228`; `apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts:73`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** both call `revokeAllUserSessions` (a watermark plus the `user_sessions` rows) but not `endUserSessions`, so Supabase refresh tokens survive. The hook refuses them while the account is blocked, but after reactivation or reinstatement a device that was the reason for the block (a lost phone) can mint tokens again. Force logout already fixed this gap for itself.
**Suggested fix:** call `endUserSessions(userId)` on deactivate and terminate, with route tests.
**Resolution:** Fixed in fix/person-page-findings (Step 3): deactivate and terminate call `endUserSessions`, which does what `revokeAllUserSessions` did and also ends the provider sessions and their refresh tokens, so a device cannot refresh back in after reactivation or reinstatement. Both route tests and the sensitive-action inventory now require `endUserSessions`.

### F-90 [P2] fixed - A two-factor reset that fails part way is neither recorded nor announced

**File:** `apps/web/src/features/gridmaster/server/two-factor-reset.ts:23`; `apps/web/src/app/api/gridmaster/users/[userId]/two-factor-reset/route.ts:55`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** if a later `deleteFactor`, the profile update or `endUserSessions` fails after some factors are gone, the route answers 500 before the `user.mfa_reset` row and the email; nothing records that factors were removed until someone retries, and a retry then records `factorsRemoved: 0`.
**Suggested fix:** return the running count from the helper and, in the route, record the reset (with `partial: true`) and send the notice whenever any factor was removed.
**Resolution:** Fixed in fix/person-page-findings (Step 3): the reset helper counts removed factors and, if it fails after removing any, throws `PartialTwoFactorResetError` with that count; the route then records `user.mfa_reset` with `partial: true` and the count, and schedules the notice, before answering 500. Helper and route tests cover it.

### F-91 [P3] open - The person page's refresh misses its history, notifications and schedule sections

**File:** `apps/web/src/components/gridmaster/person/GridmasterPersonView.tsx:88`; `apps/web/src/lib/query-keys.ts:136`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `refresh()` invalidates `["gm","person",kind,id]`, which is not a prefix of the `history`, `notifications` or `activity` keys, so after an action (terminate, two-factor reset) an open History card keeps the old list for up to 30 seconds; the key comment claims otherwise. Realtime events do reach them through `personAll`.
**Suggested fix:** invalidate the three keys in `refresh()` (or nest them under the person key) and correct the comment.
**Resolution:**

### F-92 [P3] open - Unbounded reads behind the person page

**File:** `apps/web/src/features/gridmaster/server/person-activity.ts:80`; `person-history.ts:90`; `person-record.ts:124`
**Found:** 2026-09-27 by `/audit` (scope: item 43; lens: performance)
**Why it matters:** every shift request and profile change request the person ever made is fetched and filtered to 90 days in code; the account history's `details->>targetUserId` branch has no index, so the `.or()` likely scans all of `audit_log` (unverified: no query plan taken); actor emails are one `auth.admin.getUserById` call each, twice per page.
**Suggested fix:** bound the request query in SQL (`status in (open, pending_approval)` or `created_at >= cutoff`); take a plan and add an expression index on `(details->>'targetUserId')` if it scans; resolve actors in one query.
**Resolution:**

### F-93 [P3] open - Small inconsistencies on the person page's server side

**File:** `apps/web/src/features/gridmaster/server/person-activity.ts:223`; `person-history.ts:196`; `apps/web/src/app/api/gridmaster/users/route.ts:20`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the staff schedule and history read Test Sandbox staff, which the staff record refuses (`person-record.ts:427`); the deactivate audit row writes a client-supplied, unchecked `orgId`, so it can land in an unrelated organization's activity.
**Suggested fix:** the same `workspace_kind = 'real'` check in both loaders; record deactivation with `org_id` null or check `orgId` against the target's memberships.
**Resolution:**

### F-94 [P3] open - Small client issues on the person page

**File:** `apps/web/src/components/gridmaster/person/PersonMembershipActions.tsx:215`; `apps/web/src/features/gridmaster/client/api.ts:363`; `apps/web/src/lib/staff-directory.ts:81`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** a permission conflict toasts twice (the action toasts and rethrows, `PermissionsEditor` toasts again); staff search sends a name, email or phone in the URL query, where request logs keep it; `withKnownJoinedDate` turns an unknown previous joined date into `null` ("Not joined") instead of leaving it unknown.
**Suggested fix:** return `false` after the conflict toast; send the search as a POST body; keep `undefined` when the previous date is unknown.
**Resolution:**

### F-95 [P3] open - Test gaps on the person page's actions

**File:** `apps/web/src/__tests__/GridmasterPersonView.test.tsx`; the two-factor reset and security route tests
**Found:** 2026-09-27 by `/audit` (scope: item 43; lens: tests)
**Why it matters:** terminate with its reason, reinstate, password reset, forget device, turn off push and revoke feed are mocked but never exercised in the view; every suite mocks the step-up `dialog` as null, so "a confirmation hides while step-up shows" is untested; the two-factor reset and security routes have no CSRF refusal test.
**Suggested fix:** view tests for those actions, one with a non-null step-up dialog, and CSRF tests on the two routes.
**Resolution:**

### F-96 [P3] fixed - Owner decisions left by item 43

**File:** `apps/web/src/components/gridmaster/person/PersonAccountCard.tsx:136`; `PersonMembershipActions.tsx:94`; `PersonStaffActions.tsx:87`; `blueprint/history/features/43e-combined-history.md`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** user agents are shown on terms and consent rows, as 43b chose, but 43e's archive says the record never carries them; removing someone from an organization and staff deactivate or remove need no fresh proof (as on the People page and in `organizations/access` DELETE) while role and permission changes on the same card do.
**Suggested fix:** decide whether user agents stay (then correct 43e's wording) or go; decide whether access removal needs fresh proof, server and client together.
**Resolution:** Fixed on fix/person-page-findings as the owner decided (2026-09-27). (1) The account card's terms and consent rows show the user agent as "Safari on Mac" (`describeUserAgent`, reusing the session parser, with native app cases), the raw string as the hint; 43e's archive no longer says the record never carries them. (2) `DELETE /api/organizations/access` and the deactivate and remove actions of `POST /api/employees/status` require fresh proof from a Gridmaster before any write, and the sensitive-action inventory pins both gates. The person page and the organization Users tab run them through step-up with the credential preflight; the People page and staff profile prompt only when the server refuses, through `useSharedStepUp`, so one prompt covers a bulk action and an organization admin is never asked.

### F-97 [P3] unverified - A malformed stored schedule state could fail the whole schedule section

**File:** `apps/web/src/lib/db/mappers.ts:479` (`normalizeScheduleCellState`), called by `person-activity.ts:53`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `[...state.segments]` has no guard, so a `worked` state without `segments` (for example a publish change from before the snapshot model) would throw and answer 500 for the whole section.
**Suggested fix:** confirm with a count of `schedule_publish_changes` rows whose `from_state`/`to_state` lack `kind`, or are `worked` without `segments`; if any exist, label them defensively.
**Resolution:**
