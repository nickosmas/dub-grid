# Fix: Follow-ups from the re-review of the finding fixes

**Type:** Fix
**Status:** verified
**Fixes:** F-127, F-128, F-129

## The problem

An independent `/audit` re-review closed F-101, F-107, F-50, F-109, F-108, F-26, F-20, F-25, F-05, F-106 and F-113, and found three new P3 defects in those repairs:

1. **F-127:** `recordSignInOnce` falls back to a direct write when its RPC times out, but the RPC is abandoned, not cancelled, and still records. One completion call can leave two success rows.
2. **F-128:** since 2ac009c3, an element `Button` label renders on a plain `Text` with `maxFontSizeMultiplier={MAX_FONT_SCALE}` (1.5x), past the compact 1.2x ceiling every button label keeps.
3. **F-129:** 074's header and the F-05 archive say the trigger records an invitation's first password; the normal invitation path sets it on insert, so it does not.

## The fix

1. A `TimeoutError` answers false (the call is still running and will record); only a returned error falls back.
2. `fit="compact"` on that `Text`. The native test stub now exposes `maxFontSizeMultiplier`, and the element-label test asserts 1.2.
3. Correct the archive. 074 stays unchanged, since it is on origin/dev and may be in the production rehearsal.

## Build steps

1. **The three repairs** - as above.
   - Done when: `security-audit.test.ts` holds an RPC past its deadline with no direct write, and `Button.test.tsx` asserts the compact ceiling; both fail against the previous code.

## Verify

- `npx vitest run src/lib/auth` in `apps/web`; `npx vitest run src/shared/components/Button.test.tsx` in `apps/mobile`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Evidence

- `security-audit.test.ts` and `sign-in-completion.test.ts` (14) pass; the new deadline case fails against the previous `recordSignInOnce`, which answered null and let the fallback write. `Button.test.tsx` (21) passes; its compact-ceiling assertion fails against 2ac009c3's `Button` (1.5).
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,299), `npm run test:mobile` (1,402) and the live suite (37 files, 176 tests) pass.
- The re-review itself was a fresh read-only reviewer: checksums of 069 to 074, grants and policies read from the local database, the Management API schema fetched live, 13 changed test files run.

## Findings

### audit-follow-ups/F-05 [P3] closed - The password-change audit label is client-reported, and a failed sign-out leaves no record

**File:** `apps/web/src/lib/auth/session-sign-out.ts:28`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Any assured user can record "Changed their password" on a global sign-out without changing anything, and a password change whose sign-out fails is not recorded at all. No access is gained either way.
**Suggested fix:** Record the change independently of the client, which is the F-08 decision; until then the label is client-reported.
**Resolution:** Fixed in fix/password-change-recorded, independently of the client as suggested, without deciding 41b2/F-08: migration `074_password_change_recorded.sql` adds an `AFTER UPDATE OF encrypted_password` trigger on `auth.users` that writes `security.auth.password` ("Changed their password") with the person as actor whenever the stored hash changes, by any path, so a change whose sign-out fails is still recorded. The client-labelled sign-out now reads "Signed out everywhere after a password change". `migration-074-password-change-recorded.integration.test.ts` proves one row per real change, none for an unchanged write, and no client grant; the registry test lists the trigger-written action. Not yet on production. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the trigger is live, cannot block a password change, and seeded bcrypt costs do not trigger Auth's rehash. 074's header overstates the invitation path, recorded as F-129.

### audit-follow-ups/F-20 [P3] closed - Saving notification preferences can lose a concurrent save

**File:** `apps/web/src/features/account/server/preferences.ts:31`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** The save reads, merges and upserts in three steps, so a mobile save and a web save at the same moment can drop one another's change. Before 41c1 a mobile save erased the web categories every time.
**Suggested fix:** Merge inside the database (`prefs = notification_preferences.prefs || excluded.prefs` in an RPC), which needs a migration.
**Resolution:** Fixed in fix/notification-preferences-merge: migration `072_notification_preferences_merge.sql` adds `merge_notification_preferences`, a service-role-only insert-or-merge (`(stored.prefs || EXCLUDED.prefs) - 'security'`) in one statement under the conflict's row lock, and `saveNotificationPreferences` calls it. `migration-072-notification-preferences.integration.test.ts` proves the merge, that security is never stored, the grants, and that two concurrent saves on separate connections keep both categories. Not yet on production; the app needs 072 applied before it ships. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: one `INSERT ... ON CONFLICT` merge under the row lock, never NULL, service role only; the app needs 072 applied before it ships, as recorded.

### audit-follow-ups/F-25 [P3] closed - The once-per-session sign-in record is not atomic

**File:** `apps/web/src/lib/auth/sign-in-completion.ts:61`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Two concurrent completion calls can both read nothing and both write. The app's clients guard concurrent calls.
**Suggested fix:** A partial unique index on `(actor_id, details->>'sessionHash')` for successes, which needs a migration.
**Resolution:** Fixed in fix/sign-in-recorded-once: migration `073_record_sign_in_once.sql` adds `record_sign_in_once`, which checks for the session's success row and inserts it under a transaction advisory lock on the person and session hash (a lock rather than the suggested unique index, since existing rows may already hold duplicates). `recordSignInOnce` replaces `hasRecordedSignIn`, and `recordCompletedSignIn` writes directly only when that call fails or the session has no id. `migration-073-record-sign-in-once.integration.test.ts` proves two racing calls on separate connections leave one row, plus the reauthentication rule, the refusal and the grants. Not yet on production. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the advisory lock serializes the check and insert, and the details match the app's writer. A timed-out call could still be written twice by the fallback, recorded as F-127.

### audit-follow-ups/F-26 [P3] closed - Two concurrent impersonation ends can both be recorded

**File:** `apps/web/src/app/api/gridmaster/impersonation/route.ts:205`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The row is read before `end_impersonation`, whose second call is a silent no-op, so both requests write `impersonation.ended`.
Since 41c3 the route also sends the end notice, so a concurrent pair sends two emails as well.
**Suggested fix:** Have the RPC return whether it ended a row (migration).
**Resolution:** Fixed in fix/impersonation-end-once: migration `071_end_impersonation_reports_end.sql` recreates `end_impersonation` returning true only when its update ended the row (060's body otherwise, grants to `authenticated` and `service_role`), and the end route answers 404 and records and announces nothing on `false` (a `null` from a database before 071 still counts as ended). `migration-071-end-impersonation.integration.test.ts` proves two ends return true then false with one set of notices, plus 060's single escape row, 058's end time and the grants; a route test covers the `false` case; the 058 and 060 live tests drop the function before re-running their own files. Not yet on production. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: 071's body differs from 060's only in its returns, grants match, a concurrent second end re-checks `ended_at` and returns false, and deploy order is safe either way. 002's `COMMENT ON FUNCTION` was dropped with the function (cosmetic).

### audit-follow-ups/F-50 [P3] closed - Remaining drift-guard gaps

**File:** `apps/web/src/__tests__/invitation-sql-contract.test.ts:41`; `access-token-hook-claims.test.ts`; `apps/web/src/emails/InviteEmail.tsx:72`; `apps/web/src/app/page.tsx:93`; `apps/web/src/__tests__/push-auth-templates.test.ts`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** The SQL messages are copied into the test rather than read from the route; `VerifiedClaims` and the api-auth `Claims` (which add `in_sandbox`) are not in the claim check; the 72 hours in invite and landing copy is not tied to `INVITATION_LIFETIME_HOURS`; the new tests assume they run from `apps/web`; and the push test mirrors the script's Management API field names, so a wrong name would pass.
**Suggested fix:** Read the matched strings from the route; add `VerifiedClaims` with an `in_sandbox` allowance; derive the copy from the constant; use `supabaseMigrationsDir()`-style root resolution; check field names against the Management API schema in 41d3.
**Resolution:** Fixed in fix/drift-guard-gaps: the invitation test reads the messages the route matches after `replace_pending_invitation_access` from the route itself (four today) and requires each in the function's latest `RAISE EXCEPTION`; the claim check adds `VerifiedClaims` and `api-auth`'s `Claims`, with Supabase's own claims as standard and `in_sandbox` as server-derived; the invite email and both landing lines use `INVITATION_LIFETIME_HOURS`; a `repoRootDir()` helper lets the three tests run from the root or `apps/web`; and `push-auth-templates.test.ts` checks every field the push can write against a fixture of the Management API's `UpdateAuthConfigBody` `mailer_*` properties (read 2026-09-28). Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the route-derived message list has a `>= 4` guard, `in_sandbox` is only set server-side, and the fixture matches the 38 `mailer_*` properties of the live Management API schema. Older tests' `process.cwd()` paths and the `docs/` copy are outside this finding.

### audit-follow-ups/F-101 [P2] closed - A terminate whose session ending fails is never audited and cannot be retried

**File:** `apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts:62-87`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-89
**Why it matters:** `terminate_user_account` commits (it writes no audit row itself), then F-89's `endUserSessions` runs before the `user.terminated` audit write. If ending sessions fails, the route answers 500 with no audit row, and a retry is refused with "This account is already terminated" (`021_platform_account_termination.sql:366`), so the termination is never recorded or finished. The hook still blocks refresh for a terminated account, so the exposure is the missing record of a high-risk action, not access.
**Suggested fix:** Write the audit row right after the RPC and before `endUserSessions`, or catch that failure, log it, record `sessionsEnded: false` and still write the audit; a route test where `endUserSessions` rejects.
**Resolution:** Fixed in fix/terminate-sessions-audited: once `terminate_user_account` succeeds, the route ends sessions inside its own `try`, logs a failure, and always writes `user.terminated` with `sessionsEnded` in its details, then answers 200 with `sessionsEnded`. The person page shows a warning pointing at Force logout (offered on a terminated account) when it is false. Route tests cover `endUserSessions` rejecting (audited with `sessionsEnded: false`, 200) and the audit write itself failing (500); a view test covers the warning. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the audit row is written whether or not ending sessions succeeds, a failed audit write still answers 500, Force logout stays offered and works on a terminated account, and a missing `sessionsEnded` reads as true against an older server.

### audit-follow-ups/F-106 [P3] closed - The Month view's other-area merge reads every focus area and can land in a hidden section

**File:** `apps/web/src/components/MonthView.tsx:461`, `:482`; `apps/web/src/__tests__/MonthView.test.tsx:134`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-82
**Why it matters:** the merge walks every focus area in the organization, not the person's own (`(areas + 1)` lookups per person per day across the grid on every notes change); with a focus-area filter the extra notes can go to a first row in a filtered-out section and not show; dedup keys on state, so one note filed as `published` in one area and `draft_added` in another shows two marks. Tests miss the no-area note, the filter and the row-bearing area.
**Suggested fix:** walk `emp.focusAreaIds` plus no-area, pick the first visible row, dedup on the type, and add the three cases.
**Resolution:** Fixed in fix/month-view-note-merge: the merge walks the person's own `focusAreaIds` plus no area (skipping areas where they already have a row), lands on their first row the focus-area filter leaves visible, and deduplicates on the note type. `MonthView.test.tsx` adds a no-area note, own-areas-only, the filter and one-mark-per-type cases; the last three fail against the previous code. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the merge walks the person's own areas plus none, uses the same visibility rule as the popover, dedups by type, and `activeFocusArea` is in the memo's dependencies.

### audit-follow-ups/F-107 [P3] closed - Gridmaster realtime follow-ups

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts:267`; `packages/realtime-core/src/debounced-flusher.ts`; `apps/web/src/__tests__/gridmaster-realtime-invalidation.test.ts:263`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-83
**Why it matters:** `invalidateGridmasterRealtimeQueries` has no caller left (only the re-export in `hooks/index.ts`); the flusher has no disposed flag, so an event arriving while the channel is still leaving could arm one stray flush after teardown (unverified; same for the org hooks); the test's `fire` uses `listener?.onEvent`, so a table dropped from the subscription would make the teardown test pass vacuously, and `onReconnectAfterError` is untested.
**Suggested fix:** delete the dead export, add a disposed guard in `createDebouncedTableFlusher`, assert the listener exists, and test the reconnect hook.
**Resolution:** Fixed in fix/gridmaster-realtime-follow-ups: `invalidateGridmasterRealtimeQueries` and its re-export are deleted; `createDebouncedTableFlusher` records `disposed`, so `dispose()` clears pending tables and a later `markChanged` arms nothing (a realtime-core test covers it, and the org hooks get the same guard); the Gridmaster test's `fire` throws when a table has no listener, and new tests cover `onReconnectAfterError` (one invalidation of `gridmaster.all()`) and a disabled hook subscribing to nothing. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: no reference to the deleted export remains; both flusher call sites create and dispose it inside one effect, so a disposed flusher is never reused; `fire` throws on a missing listener and the reconnect case asserts one `gridmaster.all()` invalidation.

### audit-follow-ups/F-108 [P3] closed - `schedule_notes` keeps two indexes its unique key already covers

**File:** `supabase/migrations/001_schema.sql:1394` (`idx_schedule_notes_emp`, `idx_schedule_notes_emp_date`)
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-84
**Why it matters:** both lead with `emp_id` as 063's `schedule_notes_segment_unique` does, so every note write maintains two indexes no query needs. Small at today's sizes.
**Suggested fix:** a forward migration dropping both, after checking a plan for the emp and date reads.
**Resolution:** Fixed in fix/schedule-notes-redundant-indexes: migration `070_schedule_notes_redundant_indexes.sql` drops `idx_schedule_notes_emp` and `idx_schedule_notes_emp_date`. With sequential scans off, a read by person and a read by person and date range both plan as an index scan on `schedule_notes_segment_unique` with `emp_id` (and the range) in the condition. `migration-070-schedule-notes-indexes.integration.test.ts` runs 070 from its file and asserts that, and that the unique key and `idx_schedule_notes_org_date` remain. Checksum locked; not yet on production. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: the remaining indexes and the `emp_id` foreign key's lookups are served by the unique key's leading column; 070 is idempotent.

### audit-follow-ups/F-109 [P3] closed - 065 leaves the Admin write policies and MAINTAIN on `employees`

**File:** `supabase/migrations/003_rls_policies.sql:273` (`admin_insert_employees`, `admin_update_employees`, `admin_delete_employees`); `supabase/migrations/065_employees_written_by_server_only.sql`
**Found:** 2026-09-28 by `/audit` (scope: F-100 re-review on `fix/employees-written-by-server-only`; all lenses)
**Why it matters:** with the grant revoked the three write policies grant nothing, but any later broad grant (as 004's `GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated`) would silently reopen F-100; the revoke also leaves `MAINTAIN` (lock, vacuum, reindex; no data writes and not reachable through PostgREST); 065's header omits `purge_expired_data` from its SECURITY DEFINER writers (harmless).
**Suggested fix:** a forward migration dropping the three policies and revoking `MAINTAIN`, and a live test asserting `has_table_privilege('authenticated', 'public.employees', 'UPDATE')` is false.
**Resolution:** Fixed in fix/employees-write-policies-dropped: migration `069_employees_admin_write_policies_dropped.sql` drops `admin_insert_employees`, `admin_update_employees` and `admin_delete_employees` and revokes `MAINTAIN` from `authenticated` (its header also records `purge_expired_data`). A live case in `row-level-trust-boundaries.integration.test.ts` runs 069 from its file and asserts `authenticated` holds no write privilege on `employees` (`MAINTAIN` included), the Gridmaster policy is the only permissive write policy left, and with `UPDATE, DELETE` granted back an Admin with `canManageEmployees` changes no row. Checksum locked; `db:migrations:check` passes. Not yet on production. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: `authenticated` and `anon` hold no write privilege or `MAINTAIN` on `employees` after 069, the Gridmaster policy is the only permissive write policy, and the live case fails without 069. Production Postgres is 17.6, so `REVOKE MAINTAIN` is valid there.

### audit-follow-ups/F-113 [P3] closed - FitText no longer resets for a label passed as elements

**File:** `apps/mobile/src/shared/components/FitText.tsx:66`
**Found:** 2026-09-28 by `/audit` (scope: `FitText`, `AuthField` at 3715cc49; all lenses)
**Why it matters:** the fix in 08292520 remounts the fitting logic keyed on the label's text, and element children key as an empty string, so a label given as elements that later grows would keep a shrink measured for the earlier one. No caller does this today: every `Button` passes a string `label` and nothing else renders `FitText`.
**Suggested fix:** narrow `FitText`'s `children` to `string | number` so the case cannot arise, or key element children by a caller-supplied `labelKey`.
**Resolution:** Fixed in fix/fittext-string-labels: `FitText`'s `children` is now `string | number`, so the element case cannot compile, and `Button` sends an element label down a plain one-line, truncating `Text` instead. `Button.test.tsx` proves an element label never reaches `FitText`; type-check and the 30 shared component test files (193 tests) pass. Closed 2026-09-28 by an independent `/audit` re-review of `stack/unowned-findings` (origin/dev 163f719a..45e0969d) and 2ac009c3: `FitText` takes `string | number` only and its only caller sends element labels to a plain line. That line scaled past the compact ceiling, recorded as F-128.
