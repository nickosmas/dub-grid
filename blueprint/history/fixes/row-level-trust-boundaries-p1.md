# Row-level trust boundaries: invitation role ceiling, account lifecycle columns, session rows

**Type:** Fix

**Status:** verified

**Fixes:** F-04, F-05, F-06

## The problem

Three P1 findings from the 2026-09-21 audit share one shape: the application
routes enforce a rule, but the row-level policies behind them do not, so a
member with a valid session and the anon key can bypass the rule through the
authenticated data API.

- **F-04, invitations.** `invitations_insert` (`003_rls_policies.sql:762`)
  lets any admin holding `canManageEmployees` insert a row with
  `role_to_assign = 'super_admin'`. The create route refuses that
  (`organizations/invitations/create/route.ts:142`), but the policy does not,
  and `accept_invitation` (`018_harden_invitation_acceptance.sql:124`) grants
  whatever role the row carries.
- **F-05, profile lifecycle columns.** `admin_profiles_update`
  (`003_rls_policies.sql:73`) lets an organization admin update any column
  of a profile in their organization, including `deactivated_at`,
  `deactivated_by`, `scheduled_deletion_at`, `terminated_at`,
  `terminated_by`, `terminated_reason`, `platform_role`, `role_locked` and
  `mfa_enabled`. Those are platform-wide account controls, and the profile
  may belong to someone with memberships in other organizations.
- **F-06, session rows.** `own_sessions_only` (`003_rls_policies.sql:865`)
  is `FOR ALL`, so a client whose `user_sessions` row was deleted to revoke
  it can insert the row again and pass the session check in
  `is_gridmaster` and `caller_org_id` (`016:24`). Every legitimate writer of
  that table is server-side through the service role; the browser helper in
  `lib/db/sessions.ts` has no consumer.

## The fix

One forward migration, `033_row_level_trust_boundaries.sql`, with three
independent hunks, plus a live-database test per finding. Nothing in the
application changes shape; the routes already enforce these rules, so the
migration only makes the database agree.

- **F-04:** `invitations_insert` gains
  `AND (role_to_assign <> 'super_admin' OR public.caller_org_role() = 'super_admin')`.
  `accept_invitation` is restated from 018 with one added guard before the
  membership insert: a `super_admin` invitation is honoured only if
  `invited_by` still holds an unarchived `super_admin` membership in that
  organization (or is a gridmaster); otherwise the acceptance raises and the
  invitation stays pending for a super admin to reissue. A text-equivalence
  test pins the restatement to that one hunk.
- **F-05:** column-level privileges. `REVOKE UPDATE (platform_role,
role_locked, mfa_enabled, deactivated_at, deactivated_by,
scheduled_deletion_at, deactivation_warned_at, terminated_at,
terminated_by, terminated_reason, last_sign_in_at) ON public.profiles FROM
authenticated`. The service role and the auth admin role are untouched, so
  every existing server path (gridmaster deactivate, terminate, reinstate,
  the JWT hook, the cron jobs) keeps working. `admin_profiles_update` stays
  as the row gate for the remaining columns.
- **F-06:** replace `own_sessions_only` with a SELECT-only policy on the
  caller's own rows. Inserts, updates and deletes come only from the service
  role. `lib/db/sessions.ts`, the unused browser writer, is deleted so the
  grant loss cannot surprise a future caller.

Must not break: invitation creation and acceptance through the app, the
gridmaster account lifecycle routes, `/api/auth/track-session`, session
listing and revocation in Settings, the JWT hook, and the seed.

## Build steps

- [x] **1. Invitation role ceiling (F-04)** - the policy hunk, the
      `accept_invitation` restatement with its text test, checksum, and a
      live test: an admin's direct insert of a super-admin invitation is
      refused, a super admin's is accepted, and a pending super-admin
      invitation whose inviter was since demoted cannot be accepted. Done
      when `db:migrations:check` and the tests pass and the invitation
      route tests are unchanged and green.
- [x] **2. Lifecycle columns are platform-only (F-05)** - the column
      revoke, a text test, and a live test: an admin updating a colleague's
      `first_name` succeeds while the same statement naming
      `deactivated_at` fails with a permission error; the service role still
      sets it. Done when those pass and a clean local reset applies 033.
- [x] **3. Session rows are server-owned (F-06)** - the policy swap, the
      deleted browser helper, a text test, and a live test: an authenticated
      caller reads their own session rows but cannot insert one, and the
      service role can. Done when those pass, `npm run type-check` is clean,
      and the sessions route tests are green.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` and the live
  integration tests from a worktree; a clean `supabase db reset` with the
  seed.
- Browser: sign in as `qa-super-admin@dubgrid.test` on Calm Haven, invite a
  new super admin from People, and as `qa-admin@dubgrid.test` confirm the
  invitation form offers no super-admin choice and the API refuses it. In
  Settings, list sessions and sign out another device. As the gridmaster,
  deactivate and reinstate a test account.
- `/audit` afterwards to move F-04, F-05 and F-06 from `fixed` to `closed`.

## Out of scope, decided while writing this spec

The other three findings in the authorization cluster need a product or
architecture decision first and get their own specs: F-07 (MFA assurance on
ordinary web and database reads), F-08 (employee contact columns behind a
view or RPC, which changes every client employee query) and F-09 (draft
visibility and the schedule broadcast for non-editors). The super-admin peer
safety layer stays a separate fix as recorded in the approvers history entry.

**Completed:** 2026-09-22 in commit `04bbb768` on `origin/dev`. Status `verified`:
type-check, lint, the full web and mobile suites, two clean local resets
applying migration 033, and browser and API checks of invitations, session
revocation and gridmaster deactivation. `/audit` re-reviewed the repairs the
same day and closed F-04, F-05 and F-06, recording F-21 (terms columns still
member-writable) and F-22 (a weak test assertion) as follow-ups. Archived as
written to free the active slot while `/complete` stays blocked on open P1s.
