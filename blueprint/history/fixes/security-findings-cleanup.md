# Fix: Security findings cleanup

**Type:** Fix
**Status:** verified

## Goal

Close the open review findings from item 41 that need no product decision,
one small reviewed step each, so the ledger holds only decisions and
evidence the owner must supply.

## In scope

- **F-32:** only the server writes `audit_log` and `role_change_log`
  (a migration revokes `authenticated`'s writes; every app path already
  uses the service role or a SECURITY DEFINER function).
- **F-46:** a detection error in the new-sign-in claim answers 5xx so the
  client retries instead of losing the alert.
- **F-29:** a sign-in refused by the access-token hook writes a `rejected`
  audit row with a disabled-account reason.
- **F-57:** the app's password rule has the maximum Supabase accepts.
- **F-38:** the in-app impersonation notices use the same wording as the
  emails.
- **F-41:** stale references to the retired notify route are updated.
- **F-72:** the SQL entry-point allowlist helper tracks signatures and role
  lists.
- **F-56:** view tests for the Users tab and compliance export step-up.
- **F-35:** a Gridmaster's sign-out ends live impersonations with the
  end notice and an audit row, and keeps the history.
- **F-54:** re-reviewed and closed.

## Out of scope (need a decision or owner evidence)

- F-05 (tied to F-08's client-reported label), F-62 (setting stays off),
  F-75 remainder (schedule editing), F-18 (flaky, unverified), and the
  race findings that need unique indexes or RPC changes (F-20, F-25, F-26),
  which are recorded for a later item.

## Build steps

- [x] **Step 1 - F-32 audit tables server-written only** (migration 056)
- [x] **Step 2 - F-46 and F-29 sign-in audit and alert gaps**
- [x] **Step 3 - F-57 password maximum**
- [x] **Step 4 - F-38 impersonation notice wording** (migration 057)
- [x] **Step 5 - F-41, F-72 and F-56 references, helper and tests**
- [x] **Step 6 - review and close** - an independent re-review of
      e1c83ac1..e9d49b20 closed F-29, F-32, F-35, F-38, F-41, F-46, F-56, F-57
      and F-72, and raised F-76 and F-77, both repaired and awaiting review.

## Release

Shipped in release pull request 117 (merge d64b31f1, deployed 2026-09-26,
health 200). Migrations 056 and 057 were applied by the owner after the
deploy, following a scratch rehearsal from 055 (ledger 55 to 57). After: 57
ledger entries, none missing, health 200, a final dry run up to date;
`authenticated` keeps SELECT on `audit_log` and `role_change_log` and has no
INSERT, UPDATE or DELETE; both impersonation functions carry the DubGrid
support wording, and `start_impersonation` keeps its fresh-proof guard.

F-76 and F-77, raised by the Step 6 re-review, are repaired and stay in the
ledger for a later review. F-54 was not re-reviewed here and stays there too.

## Notes for the AI

- Production migrations from this fix go by the runbook with the owner's
  approval. No em dashes.

## Findings

### security-findings-cleanup/F-29 [P3] closed - A sign-in refused by the access-token hook writes no audit row

**File:** `apps/web/src/app/api/auth/login/route.ts:445`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The `ACCOUNT_DISABLED` branch returns 403 with no record although the password was correct. Predates 41c2.
**Suggested fix:** Record it as `rejected` with a disabled-account reason (no session exists to end).
**Resolution:** Fixed in the security findings cleanup (Step 2): the web login route records a `rejected` sign-in with the new `account_disabled` reason (by address hash, since no session exists) before answering 403; the audit view reads it as "Sign-in rejected: the account is disabled". Mobile already recorded these refusals as `policy_denied`. Re-review (e1c83ac1..e9d49b20): closed; the rejection is recorded before the 403 and the test fails without the write.

### security-findings-cleanup/F-32 [P3] closed - Any signed-in user can insert audit rows as themselves

**File:** `supabase/migrations/003_rls_policies.sql:1204`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** `authenticated_insert_audit_log` lets a user write any `action` and `details`, including a `security.auth.login` success with their own `sessionHash` that would suppress the real record. Predates 41c2.
**Suggested fix:** Restrict inserts to server-written actions (a migration), or move security evidence to a table only the service role writes.
**Resolution:** Fixed in the security findings cleanup (Step 1): migration 056 revokes INSERT, UPDATE, DELETE and the rest of the writes on `audit_log` and `role_change_log` from `authenticated`; every app write already used the service role and every writing function is SECURITY DEFINER, so reads are unchanged. The live isolation test asserts the privileges. The browser-side `logAudit` in `lib/audit.ts` is reachable only from the unused `lib/db` helpers. Re-review (e1c83ac1..e9d49b20): closed; every runtime writer uses the service role or a SECURITY DEFINER function, and the live privilege check fails without 056. The browser `logAudit` in `lib/db` can no longer succeed, but its callers are imported only by tests.

### security-findings-cleanup/F-35 [P3] closed - A Gridmaster sign-out ends an impersonation with no end notice

**File:** `apps/web/src/app/api/account/logout-cleanup/route.ts:24`; `apps/web/src/features/account/server/sessions.ts:47`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** Sign-out deletes the Gridmaster's impersonation rows, live ones included: no end email, no in-app notice, and the history is gone.
**Suggested fix:** End live sessions through `end_impersonation` and send the end notice before deleting, or keep the rows.
**Resolution:** Fixed in the security findings cleanup: sign-out no longer deletes a Gridmaster's impersonation rows. `logout-cleanup` ends each live session through `end_impersonation` with the Gridmaster's own token (the in-app notices), schedules the end email and writes `impersonation.ended` with `trigger: sign_out`, as the portal's end does; ended rows stay as history, and the proxy already ignores them. Route tests cover the end, a non-Gridmaster and a failed end. Re-review (e1c83ac1..e9d49b20): closed; sign-out is never blocked, ended rows are kept, and the email names no one. Its handling of long-expired rows is F-76.

### security-findings-cleanup/F-38 [P3] closed - In-app impersonation notices still say a platform administrator is reviewing the account

**File:** `supabase/migrations/002_functions_triggers.sql` (`start_impersonation`, `end_impersonation`)
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The same event reads as "DubGrid support is using your account" by email and as "A platform administrator is currently reviewing your account" in the app.
**Suggested fix:** A forward migration rewording the two RPCs' notification text.
**Resolution:** Fixed in the security findings cleanup (Step 4): migration 057 redefines `start_impersonation` (from 055, keeping its fresh-proof guard) and `end_impersonation` with notices that read "DubGrid support is using your account" and "DubGrid support has left your account" (and matching Super Admin notices), naming no person. A static test pins the wording and the guard. Re-review (e1c83ac1..e9d49b20): closed; 057's two functions differ from 055 and 002 only in the notice text, with the guard, signature and grants unchanged.

### security-findings-cleanup/F-41 [P3] closed - Stale references to the retired notify route, and no rate limit on impersonation notices

**File:** `apps/web/e2e/role-variance-impersonation.spec.ts:101`; `internal/api-reference.md:195`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The e2e spec and the API reference still describe `/api/notify-impersonation`, and the old route's `apiLimiter` has no counterpart, so repeated start and end cycles email the person each time (each still needs a justification and writes an audit row).
**Suggested fix:** Update the two references when the documentation work lands; consider a per-target limit on starts.
**Resolution:** Fixed in the security findings cleanup (Step 5): the impersonation e2e spec no longer excuses failures of `/api/notify-impersonation` (nothing calls it since 41c3, so a real failure now surfaces), and the API reference marks the route retired. No per-target limit was added: since 41d7 a start needs fresh proof as well as a justification and an audit row. Re-review (e1c83ac1..e9d49b20): closed; nothing calls the retired route. No rate limit was added, since a start needs fresh proof since 055.

### security-findings-cleanup/F-46 [P3] closed - A detection error in the new-sign-in claim loses the alert without a retry

**File:** `apps/web/src/features/account/server/security-alerts.ts:74`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** `claimNewSignIn` catches a database error and returns no claim, and the route still answers 200, so the client never retries and the alert is gone.
**Suggested fix:** Answer 5xx when detection fails so the client retries, or record the failure for a later sweep.
**Resolution:** Fixed in the security findings cleanup (Step 2): `claimNewSignIn` no longer swallows a read error, so `track-session` answers 500 and mobile `session-presence` answers 503, both of which the clients retry (41d1); nothing is written before a failure, so a retry is safe. Tests cover both routes and the claim. Re-review (e1c83ac1..e9d49b20): closed; both clients retry a 5xx twice at most, and a failed claim writes nothing.

### security-findings-cleanup/F-56 [P3] closed - No view tests for the 41d3 step-up wiring

**File:** `apps/web/src/components/gridmaster/organization-detail/UsersTab.tsx`; `apps/web/src/components/gridmaster/GridmasterComplianceView.tsx`
**Found:** 2026-09-25 by `/audit` of a6e3c15c
**Why it matters:** Hiding the confirmations behind the step-up dialog, clearing loading on cancel, and downloading nothing without assurance are proven only by reading.
**Suggested fix:** View tests in the pattern of `GridmasterAccountsView.test.tsx`.
**Resolution:** Fixed in the security findings cleanup (Step 5): the Users tab tests cover the role change with the assured token, a cancelled step-up clearing its loading state, and the confirmation hiding behind the prompt; a new compliance view test covers the audit-log export with the assured token, a cancelled step-up downloading nothing, and a failed credential check. Each was confirmed to fail on a matching regression. Re-review (e1c83ac1..e9d49b20): closed; the view tests catch the regressions they name.

### security-findings-cleanup/F-57 [P3] closed - The app's password rule has no maximum where Supabase may refuse long passwords

**File:** `packages/domain/src/password.ts`
**Found:** 2026-09-25 by `/audit` of a6e3c15c
**Why it matters:** Supabase Auth likely refuses passwords over 72 characters (bcrypt), which the app would accept, the same drift F-47 closed for character classes.
**Suggested fix:** Confirm the limit and add it to the rule and the policy test.
**Resolution:** Confirmed and fixed in the security findings cleanup (Step 3): Supabase Auth v2.187.0 refuses a password over 72 bytes (`MaxPasswordLength`, counted as UTF-8 in `internal/api/password.go`). The shared rule now refuses the same (`PASSWORD_MAX_BYTES`, `passwordByteLength`) and shows an "At most 72 characters" hint only when the limit is broken; tests cover 72 and 73 bytes and multi-byte characters. Re-review (e1c83ac1..e9d49b20): closed; every web, mobile and register path uses the shared byte count. The hint's wording is F-77.

### security-findings-cleanup/F-72 [P3] closed - The SQL entry-point allowlist helper matches names, one grant spelling and simple signatures

**File:** `apps/web/src/__tests__/helpers/sql-inventory.ts:30`
**Found:** 2026-09-26 by `/audit` re-review of e4e6f905..f2ff543e
**Why it matters:** It tracks function names rather than signatures, so revoking one overload would drop a name another overload still grants; it only sees a grant spelled `TO authenticated;`; and `[^)]*` breaks on a typed parameter such as `NUMERIC(10,2)`. None applies to today's migrations, and the live function-grant check would still catch a real drift.
**Suggested fix:** Track `name(signature)` pairs and accept a role list in the grant pattern.
**Resolution:** Fixed in the security findings cleanup (Step 5): the helper now reads grants and revokes with any role list that names `authenticated` and argument lists that nest one level of parentheses. It still keys on function names, as the live check does; an overload revoked while another stays granted would need both to key on signatures. Re-review (e1c83ac1..e9d49b20): closed as scoped; it still keys on names, which no current migration trips and the live grant check backs up.
