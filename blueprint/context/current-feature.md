# Feature: Gridmaster direct writes need fresh proof

**From build-plan:** feature 41d6
**Status:** in progress

## Goal

The `gridmaster_all_*` policies (and the Gridmaster insert and update
policies on `impersonation_sessions`, `audit_log` and `role_change_log`) let
a Gridmaster's token insert, update or delete organization data through the
data API without a recent sign-in (F-74). No application path writes these
tables with a Gridmaster's own token: impersonated edits run through the
service role or SECURITY DEFINER functions. So the database can require
fresh proof for those direct writes at no cost to how Gridmasters work.

## In scope

- **A callable proof helper.** `gridmaster_write_allowed()` is true for any
  caller who is not a Gridmaster, and for a Gridmaster only with
  `caller_has_fresh_proof()`. It is granted to `authenticated`, because
  Postgres checks a policy function's EXECUTE for every caller the policy
  applies to (the proof check itself stays private).
- **Restrictive write policies.** Every table with a Gridmaster write policy
  gets restrictive INSERT, UPDATE and DELETE policies for `authenticated`
  that require the helper. Reads are unchanged.
- **A drift guard.** A live test fails if a table with a Gridmaster write
  policy lacks the three restrictive policies.

## Out of scope

- The SECURITY DEFINER functions that authorize a Gridmaster with
  `is_gridmaster()` in their bodies (schedule edits and publishing,
  `check_admin_permission_for_org`, `is_authorized_org`). Requiring fresh
  proof there would interrupt impersonated editing every five minutes
  unless the schedule screens run through step-up; recorded as a decision
  for the owner.

## Build loop

Each step is implemented, verified and self-reviewed on `dev`, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - helper and restrictive policies** - migration 054. _Done
      when:_ live tests prove a stale Gridmaster token cannot insert, update
      or delete on representative tables, a fresh one can, an ordinary
      member's own writes (notifications) still pass, and every table with a
      Gridmaster write policy carries the three restrictive policies.
- [x] **Step 2 - inventories and suites** - the SQL entry-point allowlist
      includes the helper; the full web suite and every live test pass.
- [x] **Step 3 - record the remaining surface** - F-74 narrowed to the
      SECURITY DEFINER functions, with the trade-off stated.

## Files / areas

- `supabase/migrations/054_*.sql`, `checksums.sha256`.
- `apps/web/src/__tests__/` (a live test, `authorization-sql-boundaries.test.ts`).

## Data / contracts

- No table or column change. Restrictive policies apply to `authenticated`
  only; the service role and SECURITY DEFINER functions bypass RLS.
- Production: additive, and safe before or after the release.

## Testing

- Live SQL tests with simulated claims, the allowlist test, and the full web
  suite.

## Notes for the AI

- No em dashes.
