# Feature: Gridmaster direct writes need fresh proof

**From build-plan:** feature 41d6
**Status:** verified

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

- [x] **Repair the audit's findings (ea7215d9..61a06a78)** - the
      notifications bulk route writes with the service role (a Gridmaster's
      mark-read no longer depends on fresh proof); the policies call the
      helper once per statement; 054 sets a 5 s lock timeout; the drift guard
      checks each restrictive expression; F-75 names `start_impersonation`
      and `force_logout_user`. 054 was revised before it left this worktree
      and re-run on the local stack.

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

## Findings

### 41d6/F-74 [P3] closed - A Gridmaster token can still write most organization data directly

**File:** `supabase/migrations/003_rls_policies.sql` (the `gridmaster_all_*` FOR ALL policies)
**Found:** 2026-09-26 while scoping 41d5
**Why it matters:** Beyond grants (closed by 051 and 052), the Gridmaster policies are FOR ALL on nearly every organization table (schedules, employees, departments, settings, notifications, subscriptions, feature flags), and `authenticated` holds write privileges on them, so a stolen Gridmaster token could change or delete organization data through the data API without a recent sign-in. Grants of authority are no longer reachable this way (051 to 053). `impersonation_sessions` is among the writable tables, so a stale Gridmaster token could insert an impersonation session directly and skip the justification, the audit row and the notice.
**Suggested fix:** A decision for the owner: narrow the Gridmaster policies to SELECT and route Gridmaster writes through the server, or require `caller_has_fresh_proof()` in those policies' write checks, or accept the risk.
**Resolution:** Owner chose the recent-sign-in option (2026-09-26, 41d6). Migration 054 adds `gridmaster_write_allowed()` (true for anyone but a Gridmaster without `caller_has_fresh_proof()`, granted to `authenticated` because Postgres checks a policy function's EXECUTE for every caller) and restrictive INSERT, UPDATE and DELETE policies for `authenticated` on all 36 tables a Gridmaster policy lets it write, `impersonation_sessions` included. No application path writes these tables with a Gridmaster's own token, so nothing changes in use. Live tests prove a stale token changes nothing, a fresh one writes, an ordinary member's own writes pass, and every such table carries the three policies (failing if a table is added without them). The SECURITY DEFINER functions that authorize a Gridmaster in their bodies are F-75. Audit (ea7215d9..61a06a78) kept it fixed: the notifications bulk route wrote with the caller's own token, so a Gridmaster's mark-read or archive would silently change nothing after five minutes; it now uses the service role with its existing user and organization filters. The policies call the helper once per statement, the migration sets a 5 s lock timeout, and the drift guard checks each restrictive expression. Re-review (91ce4694): closed; the inbox update stays limited to the caller's own rows, the policies run once per statement, and the drift guard now matches each expression exactly. The lock timeout uses SET and RESET so it applies however the runner sends the file.

## How to try it

No screen changes. The Gridmaster inbox's mark-read and archive keep working
at any age of sign-in. The database-side refusal is proven by
`gridmaster-direct-writes.integration.test.ts`.
