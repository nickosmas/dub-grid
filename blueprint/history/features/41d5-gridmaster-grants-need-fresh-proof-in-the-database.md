# Feature: Gridmaster grants need fresh proof in the database

**From build-plan:** feature 41d5
**Status:** verified

## Goal

The routes ask a Gridmaster for a recent sign-in before any grant (41d3,
41d4), but the database does not: a Gridmaster's token can call the grant
functions through the data API, and the `gridmaster_all_memberships` policy
lets it write memberships directly, so a stolen or stale Gridmaster token
could still make anyone a Super Admin or a Gridmaster (F-60). The database
should apply the same fresh-proof rule, and no signed-in caller should write
memberships directly.

## In scope

- **A database fresh-proof check** that mirrors
  `evaluateSensitiveActionAssurance` in `packages/authz/src/assurance.ts`:
  the required method is `totp` when the caller has a verified TOTP factor
  (and then `aal2` is required), otherwise `password`; the newest matching
  `amr` timestamp must be within 300 seconds, and no more than 30 seconds in
  the future.
- **The grant functions refuse a Gridmaster without fresh proof:**
  `change_user_role`, `assign_org_role_by_email`,
  `promote_gridmaster_by_email`, `demote_gridmaster_account` and
  `set_gridmaster_account_deactivated` raise `STEP_UP_REQUIRED` when the
  caller is a Gridmaster and the check fails. Other callers are unchanged.
  The routes already gate these calls with the same token, so nothing the
  app does changes.
- **Memberships are written by the server only:** `authenticated` loses
  INSERT, UPDATE and DELETE on `organization_memberships` (every app write
  already uses the service role), and the unused browser-side
  `updateAppOnlyUser` in `apps/web/src/lib/db/organizations.ts` is removed.

## Out of scope

- The Gridmaster `FOR ALL` policies on the other tables (schedules,
  employees, settings, notifications and so on). They are not grants of
  authority; recorded as a decision for the owner.
- Organization Super Admins calling the functions directly: their tier
  guards already bound what they can grant.

## Build loop

Each step is implemented, verified and self-reviewed on `dev`, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - the fresh-proof check** - migration 051 adds
      `caller_has_fresh_proof()`. _Done when:_ live tests with simulated
      claims prove fresh password, stale password, fresh TOTP at aal2, TOTP
      at aal1, a future timestamp and missing `amr`, matching the TypeScript
      rule.
- [x] **Step 2 - the grant functions refuse a stale Gridmaster** - the same
      migration redefines the five functions from their newest definitions
      with the guard first. _Done when:_ live tests prove each refuses a
      stale Gridmaster, a fresh one still works, and a Super Admin's
      `change_user_role` is unaffected; a static test pins the guard in each
      newest definition.
- [x] **Step 3 - memberships are written by the server only** - migration
      052 revokes the writes; the dead helper goes. _Done when:_ the live
      isolation test proves `authenticated` cannot insert, update or delete
      memberships, and the web suite passes.
- [x] **Step 4 - record the remaining surface** - a finding for the owner on
      the other Gridmaster write policies.

- [x] **Repair the audit's grant paths (249941d4..87a64796)** - migration
      053: `change_user_role` takes Gridmaster authority only from
      `is_gridmaster()`, `profiles` loses INSERT, DELETE and TRUNCATE, and an
      oversized amr timestamp proves nothing; the four routes answer a
      database refusal with the step-up prompt. _Done when:_ live tests for a
      pending second factor, a deactivated Gridmaster and profile writes fail
      without 053, and the web suite passes.

## Files / areas

- `supabase/migrations/051_*.sql`, `052_*.sql`, `checksums.sha256`.
- `apps/web/src/__tests__/*` (new live and static SQL tests,
  `org-isolation.integration.test.ts`).
- `apps/web/src/lib/db/organizations.ts`.

## Data / contracts

- No table or column change. The functions keep their signatures and raise
  `STEP_UP_REQUIRED` for a stale Gridmaster.
- Production: 051 and 052 are additive tightenings that no deployed code
  depends on (every route already gates and every membership write uses the
  service role), so they can be applied before or after the release.

## Testing

- Live SQL tests against the local stack with simulated JWT claims, static
  tests on the newest function definitions, and the full web suite.

## Notes for the AI

- Build each function from its newest definition
  (`latestFunctionDefinition` in `apps/web/src/__tests__/helpers/sql-inventory.ts`);
  never edit an applied migration.
- No em dashes.

## Findings

### 41d5/F-60 [P2] closed - A Gridmaster token can change memberships and invitations directly in the database

**File:** `supabase/migrations/003_rls_policies.sql:117`, `:751`; `016_harden_authorization_boundaries.sql:79`; `043_invitation_inviter_is_verified.sql:250`
**Found:** 2026-09-25 by `/audit` re-review of 7ba79e75
**Why it matters:** `change_user_role`, `assign_org_role_by_email` and `send_invitation` are executable by `authenticated`, and the `gridmaster_all_memberships` and `gridmaster_all_invitations` policies are FOR ALL, so a Gridmaster token can insert a Super Admin membership through PostgREST, skipping every route gate. The same class as F-08; `is_gridmaster()` needs aal2 but not a recent sign-in.
**Suggested fix:** A decision with F-08: narrow the Gridmaster policies to SELECT and route writes through server-only functions, or require a recent authentication in the RPCs.
**Resolution:** Owner chose to fix it (2026-09-26, 41d5). Migration 049 closed the invitations half. Migration 051 adds `caller_has_fresh_proof()`, the routes' fresh-proof rule in SQL, and the five grant functions (`change_user_role`, `assign_org_role_by_email`, `promote_gridmaster_by_email`, `demote_gridmaster_account`, `set_gridmaster_account_deactivated`) refuse a Gridmaster without it; migration 052 takes INSERT, UPDATE and DELETE on `organization_memberships` from `authenticated`, since only the service role and SECURITY DEFINER functions write them. Live tests prove the rule case by case, each function's refusal (failing without the guard), and the revoked privileges; a static test pins the guard in each newest definition. The Gridmaster write policies on the non-grant tables are F-74. Audit of 249941d4..87a64796 kept it fixed: `change_user_role` read `platform_role` directly, so a Gridmaster with a pending second factor, a deactivated account or a revoked session skipped the guard yet kept Gridmaster authority, and `authenticated` kept INSERT and DELETE on `profiles`, so a Gridmaster token could re-insert any profile as a Gridmaster. Migration 053 takes that authority only from `is_gridmaster()` (and ignores an archived caller membership), revokes INSERT, DELETE and TRUNCATE on `profiles`, and makes an oversized amr timestamp prove nothing instead of overflowing; the four routes that call these functions answer a database refusal with the step-up prompt. Live tests for each path fail without 053. Re-review (4afebcf4): closed; `change_user_role` is otherwise unchanged, no legitimate caller inserts or deletes profiles, and 051 to 053 are safe to apply to production in order, before or after the release. The route helper now matches only the guard's exact refusal.

## How to try it

There is no screen change. On the local stack, as the QA Gridmaster: the
Gridmaster portal's role changes and invitations still work after a recent
sign-in and prompt after five minutes, as in 41d4. The database-side
refusal is proven by `gridmaster-fresh-proof.integration.test.ts`.
