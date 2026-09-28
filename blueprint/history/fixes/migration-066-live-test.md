# Fix: A live test for migration 066

**Type:** Fix
**Status:** verified
**Fixes:** F-111

## The problem

Migration `066_person_history_target_index.sql` adds two things, and neither
is re-checked by any test:

- `gridmaster_user_emails(uuid[])` is a SECURITY DEFINER function that returns
  the email of any account. It is safe only because `PUBLIC`, `anon` and
  `authenticated` cannot execute it and only `service_role` can. A later
  migration with a broad grant would expose every email without failing
  anything.
- `idx_audit_log_details_target_user` is what turns the person history's
  three-way OR from a sequential scan of `audit_log` into a bitmap OR. That
  was proven by hand in a rolled-back plan, not by a test.

Migrations `063` and `064` run from their files in live tests; `066` has none.

## The fix

- A new live test, `migration-066-person-history.integration.test.ts`, in the
  style of `schedule-notes-per-shift.integration.test.ts`:
  - `// @vitest-environment node`, skipped when the local Postgres is
    unreachable
  - each case runs `066` from its file inside `BEGIN`/`ROLLBACK`; both
    statements are idempotent, so it works whether or not the local database
    has applied `066` yet
  - it locks `audit_log` first (`LOCK TABLE ... IN SHARE MODE`), because
    building the index takes that lock and parallel live tests insert audit
    rows (see the integration-test DDL deadlock note)
- It asserts:
  - `has_function_privilege` is false for `anon` and `authenticated` and true
    for `service_role`
  - a call made as `authenticated` (`SET LOCAL ROLE`, inside a savepoint) is
    refused with "permission denied"
  - the function returns a seeded user's email, and nothing for an unknown id
  - with sequential scans off, the person history's OR plans through
    `idx_audit_log_details_target_user`
- No product code changes. The test must fail if `066`'s `REVOKE` or `GRANT`
  lines change, or if the index is dropped.

Must not break: the other live tests running in parallel, and a local database
that has or has not applied `066`.

## Build steps

- [x] **1. The 066 live test.**
  - _Done when:_
    - the test passes against the local database, alone and in the full
      `npm run test:web`
    - a copy of `066` with `GRANT EXECUTE ... TO authenticated` added makes
      the privilege case fail, and one without the index makes the plan case
      fail (checked once by pointing the test at a temporary copy, then
      restored)

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`
- Run the new file alone: `npx vitest run src/__tests__/migration-066-person-history.integration.test.ts`
  from `apps/web`.

## Findings

### migration-066-live-test/F-73 [P2] closed - Production Supabase accepts public sign-ups on an invite-only product

**File:** `supabase/config.toml:165` (`enable_signup = true`); production auth config (`disable_signup: false`, read 2026-09-26)
**Found:** 2026-09-26 during the email review (read-only Management API read)
**Why it matters:** `internal/authentication.md` and `RBAC_SYSTEM_DESIGN.md` say email sign-up is off in production, but it is on. Anyone with the public publishable key can create and confirm an account through `/auth/v1/signup`, or through a sign-in link request, which also creates a missing user while sign-ups are open. The account has no organization, so RLS should still hide tenant data, but every RPC granted to `authenticated` becomes reachable by strangers.
**Suggested fix:** Set `disable_signup: true` on production (dashboard or Management API). Only `/api/invitations/register` creates accounts, through `auth.admin.createUser`, which ignores the setting. Local `config.toml` stays open for the integration tests that call `signUp`. Consider having `auth:templates:check` report the setting so it cannot drift again.
**Resolution:** Production set to `disable_signup: true` through the Management API on 2026-09-26 (read back true; email sign-in and confirmation unchanged). Local `config.toml` stays open for the integration tests. The drift check in `auth:templates:check` is not added yet. Re-review 2026-09-28 (`/audit`, read-only Management API read): production reports `disable_signup: true` with email sign-in still enabled; closed. The suggested drift check in `auth:templates:check` remains optional.
