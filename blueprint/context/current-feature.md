# Feature: Gridmaster grants need fresh proof in the database

**From build-plan:** feature 41d5
**Status:** in progress

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
- [ ] **Step 4 - record the remaining surface** - a finding for the owner on
      the other Gridmaster write policies.

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
