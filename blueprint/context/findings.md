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

### F-101 [P2] open - A terminate whose session ending fails is never audited and cannot be retried

**File:** `apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts:62-87`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-89
**Why it matters:** `terminate_user_account` commits (it writes no audit row itself), then F-89's `endUserSessions` runs before the `user.terminated` audit write. If ending sessions fails, the route answers 500 with no audit row, and a retry is refused with "This account is already terminated" (`021_platform_account_termination.sql:366`), so the termination is never recorded or finished. The hook still blocks refresh for a terminated account, so the exposure is the missing record of a high-risk action, not access.
**Suggested fix:** Write the audit row right after the RPC and before `endUserSessions`, or catch that failure, log it, record `sessionsEnded: false` and still write the audit; a route test where `endUserSessions` rejects.
**Resolution:**

### F-102 [P3] open - Two-factor reset follow-ups

**File:** `apps/web/src/emails/TwoFactorResetEmail.tsx:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.ts:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.test.ts:14`; comments at `terminate/route.ts:71` and `gridmaster/users/route.ts:225`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-90
**Why it matters:** a partial reset still emails "signed you out everywhere" although `endUserSessions` never ran; the re-enrollment flag is set before any factor is removed, so a failure in `listFactors` leaves the person gated to re-enroll with no record or email; no test makes the profile update or `endUserSessions` fail after every factor is gone; two comments still describe watermark-only revocation.
**Suggested fix:** a `partial` prop with softer wording; set the flag after the first removal, or record the attempt; the two failure tests; refresh the comments.
**Resolution:**

### F-103 [P3] open - Each step-up-refused status change is sent three times, and a bulk can partly apply

**File:** `apps/web/src/components/staff/useSharedStepUp.tsx:21`; `apps/web/src/hooks/useStepUpAction.tsx:43`; `apps/web/src/app/api/employees/status/route.ts:61`; `apps/web/src/app/api/employees/status/route.test.ts:163`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** the refused first send, then `stepUp.run`'s own attempt with the current token before it prompts, then the retry: three requests per row against `apiLimiter` (10 per 10 s), which the route checks before the gate. A Gridmaster's bulk of five or more confirmed quickly can hit 429 on the last retries and apply only part of the batch, which F-98's quiet-cancel counting then reports as done (unverified in a browser). The status route test covers only `deactivate`, not `remove`, `activate` staying ungated, or a Gridmaster with fresh proof going on to write.
**Suggested fix:** a "prompt now" entry on `useStepUpAction` that skips the first attempt, bounded bulk concurrency, `toHaveBeenCalledTimes` in `useSharedStepUp.test.tsx`, and the three route cases.
**Resolution:**

### F-104 [P3] open - Consent-row device labels over-claim the DubGrid app

**File:** `apps/web/src/lib/user-agent-label.ts:13`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** any CFNetwork and Darwin client (a Mac app, an iPad, any iOS app) reads "DubGrid app on iPhone", and any `okhttp/` client "DubGrid app on Android", on rows kept as consent evidence from a client-set header; the card says "Mac" and "Windows" where the sessions list says "Macintosh" and "Windows PC".
**Suggested fix:** require the app's own `DubGrid/` token before naming the app, fall back to a neutral label, and share one vocabulary with the sessions list.
**Resolution:**

### F-105 [P3] open - The person history's detail stripping is a narrow denylist, and two edge cases drop events

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:163`, `:237`, `:100`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-85 and F-87
**Why it matters:** no leak today (every current writer puts IP and user agent in columns and only the three hash keys in `details`), but only three top-level keys are removed, so a later writer adding `ipHash`, `userAgent` or a nested hash would reach the history and its export; the F-87 filter compares `actor_id` to a `userId` the route accepts in any case, so an uppercase id would drop the person's own impersonation actions (unverified, clients send lowercase); an impersonation older than the newest 500 sessions is now missing rather than duplicated (`truncated` is set).
**Suggested fix:** strip keys matching a hash, IP or user-agent pattern at any depth (or an allowlist per action), lowercase the id at the route, and say in the card when the session list was capped.
**Resolution:**

### F-106 [P3] open - The Month view's other-area merge reads every focus area and can land in a hidden section

**File:** `apps/web/src/components/MonthView.tsx:461`, `:482`; `apps/web/src/__tests__/MonthView.test.tsx:134`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-82
**Why it matters:** the merge walks every focus area in the organization, not the person's own (`(areas + 1)` lookups per person per day across the grid on every notes change); with a focus-area filter the extra notes can go to a first row in a filtered-out section and not show; dedup keys on state, so one note filed as `published` in one area and `draft_added` in another shows two marks. Tests miss the no-area note, the filter and the row-bearing area.
**Suggested fix:** walk `emp.focusAreaIds` plus no-area, pick the first visible row, dedup on the type, and add the three cases.
**Resolution:**

### F-107 [P3] open - Gridmaster realtime follow-ups

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts:267`; `packages/realtime-core/src/debounced-flusher.ts`; `apps/web/src/__tests__/gridmaster-realtime-invalidation.test.ts:263`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-83
**Why it matters:** `invalidateGridmasterRealtimeQueries` has no caller left (only the re-export in `hooks/index.ts`); the flusher has no disposed flag, so an event arriving while the channel is still leaving could arm one stray flush after teardown (unverified; same for the org hooks); the test's `fire` uses `listener?.onEvent`, so a table dropped from the subscription would make the teardown test pass vacuously, and `onReconnectAfterError` is untested.
**Suggested fix:** delete the dead export, add a disposed guard in `createDebouncedTableFlusher`, assert the listener exists, and test the reconnect hook.
**Resolution:**

### F-108 [P3] open - `schedule_notes` keeps two indexes its unique key already covers

**File:** `supabase/migrations/001_schema.sql:1394` (`idx_schedule_notes_emp`, `idx_schedule_notes_emp_date`)
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-84
**Why it matters:** both lead with `emp_id` as 063's `schedule_notes_segment_unique` does, so every note write maintains two indexes no query needs. Small at today's sizes.
**Suggested fix:** a forward migration dropping both, after checking a plan for the emp and date reads.
**Resolution:**

### F-109 [P3] open - 065 leaves the Admin write policies and MAINTAIN on `employees`

**File:** `supabase/migrations/003_rls_policies.sql:273` (`admin_insert_employees`, `admin_update_employees`, `admin_delete_employees`); `supabase/migrations/065_employees_written_by_server_only.sql`
**Found:** 2026-09-28 by `/audit` (scope: F-100 re-review on `fix/employees-written-by-server-only`; all lenses)
**Why it matters:** with the grant revoked the three write policies grant nothing, but any later broad grant (as 004's `GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated`) would silently reopen F-100; the revoke also leaves `MAINTAIN` (lock, vacuum, reindex; no data writes and not reachable through PostgREST); 065's header omits `purge_expired_data` from its SECURITY DEFINER writers (harmless).
**Suggested fix:** a forward migration dropping the three policies and revoking `MAINTAIN`, and a live test asserting `has_table_privilege('authenticated', 'public.employees', 'UPDATE')` is false.
**Resolution:**

### F-110 [P3] open - The person page's request lists do not say they stop at 90 days

**File:** `apps/web/src/components/gridmaster/person/PersonScheduleSection.tsx:167`, `:195`; `apps/web/src/features/gridmaster/server/person-activity.ts:117`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; all lenses)
**Why it matters:** "Shift requests" has always shown open requests plus the last 90 days, and since F-92 "Profile change requests" does too (before, it listed every one ever made), but neither title says so, unlike "Publish changes, last 90 days". A Gridmaster looking for an older resolved request reads an empty list as "none".
**Suggested fix:** Title both groups "..., open and last 90 days", or keep profile change requests unbounded (they are few) and label only shift requests.
**Resolution:**

### F-111 [P3] fixed - Migration 066 has no live test

**File:** `supabase/migrations/066_person_history_target_index.sql`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: tests)
**Why it matters:** `gridmaster_user_emails` returns any account's email and is safe only because of its grants. The refusal for `anon` and `authenticated` and the index plan were proven by hand in a rolled-back transaction, but nothing re-checks them, unlike 063 and 064, which run from their files in live tests. A later broad grant would expose every email silently.
**Suggested fix:** A live test that runs 066 from its file in a rolled-back transaction and asserts `has_function_privilege` is false for `anon` and `authenticated` and true for `service_role`, and that the function returns a seeded user's email.
**Resolution:** Fixed in fix/migration-066-live-test: `migration-066-person-history.integration.test.ts` runs 066 from its file inside a rolled-back transaction (taking `audit_log`'s share lock first) and asserts that only `service_role` may execute `gridmaster_user_emails`, that an `authenticated` call is refused, that it returns a seeded account's email and nothing for an unknown id, and that the history's OR plans through `idx_audit_log_details_target_user` with sequential scans off. A copy of 066 granting `authenticated` fails two cases; one without the index fails the plan case. Passes alone and in the full `test:web` (5,209).

### F-112 [P3] unverified - Migration 066 locks `audit_log` writes while its index builds

**File:** `supabase/migrations/066_person_history_target_index.sql:15`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: performance)
**Why it matters:** `CREATE INDEX` without `CONCURRENTLY` blocks inserts into `audit_log` for the length of the build, and every audited action writes there. Harmless at today's sizes, but production's row count was not measured.
**Suggested fix:** Read production's `audit_log` row count (read-only) during the release rehearsal and time the build on the scratch stack; if it is more than a few seconds, build the index `CONCURRENTLY` outside the migration transaction.
**Resolution:**

### F-113 [P3] open - FitText no longer resets for a label passed as elements

**File:** `apps/mobile/src/shared/components/FitText.tsx:66`
**Found:** 2026-09-28 by `/audit` (scope: `FitText`, `AuthField` at 3715cc49; all lenses)
**Why it matters:** the fix in 08292520 remounts the fitting logic keyed on the label's text, and element children key as an empty string, so a label given as elements that later grows would keep a shrink measured for the earlier one. No caller does this today: every `Button` passes a string `label` and nothing else renders `FitText`.
**Suggested fix:** narrow `FitText`'s `children` to `string | number` so the case cannot arise, or key element children by a caller-supplied `labelKey`.
**Resolution:**
