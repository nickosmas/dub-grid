# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P2] open - Deleting a long series reads only its first 1,000 cells, orphaning shift notes

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1484`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: performance)
**Why it matters:** The read of a series' cells before `delete_shift_series` is unpaged, and `db.max_rows = 1000` (`supabase/config.toml:18`) applies to every role including `service_role`. The rows feed `clearScheduleNotesForCells`, and `schedule_notes` has no foreign key to the cell, so notes on cells past the first 1,000 survive the deletion and render an indicator against a shift that no longer exists. This is the same class as the already-repaired F-11 truncation, and it violates the standing rule that every shift-removal path clears notes. Only reachable while F-02 stands, since 183 occurrences cannot cross the cap; it is recorded separately because raising the legitimate series ceiling would reintroduce it even after F-02 is clamped.
**Suggested fix:** Page the read with `.range` in a deterministic order, reusing the pager shape already used by `fetchNormalizedPublishedShiftRows` and `fetchScheduleCellQueryRows`.
**Resolution:**

### F-05 [P3] open - Six integration claim builders hardcode the enrollment claim with no override

**File:** `apps/web/src/__tests__/draft-state-editor-only.integration.test.ts:124` and the same `asUser` helper in `row-level-trust-boundaries`, `employee-contact-columns`, `auto-approve-shift-requests`, `schedule-children-org-consistency` and `role-escalation-guards`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: tests)
**Why it matters:** The F-01 repair added `mfa_enrolled: false` to each of these literal claim objects, which is right (it is what a real token carries) but fixed: unlike `org-isolation`, whose setter spreads `{ mfa_enrolled: false, ...claims }` so a test can override it, these six cannot express an enrolled caller at all. Any future case in those files that wants to prove a policy refuses an unchallenged enrolled member has to edit the shared helper first, which is the kind of friction that ends in the case not being written.
**Suggested fix:** Give each `asUser` an optional claims override merged the way `org-isolation` does, or lift one shared helper into `__tests__/helpers/` and have all seven use it.
**Resolution:**

### F-06 [P3] open - change_user_role runs under the service role, so its own tier guards never fire

**File:** `apps/web/src/app/api/organizations/access/route.ts:276`; `packages/data-access/src/mobile.ts:1693`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security)
**Why it matters:** Both callers invoke the RPC with the service client, which has no `auth.uid()`, so the RPC's identity, caller-tier and admin-tier checks pass vacuously. This is documented at `packages/data-access/src/mobile.ts:1677` and the compensating application checks are real and were verified in this pass: the web route gates on `isGridmaster || isSuperAdmin` (`requirePrivilegedActor`), and the mobile gate's `canManageUsers` resolves to `isSuperAdmin || isGridmaster` and is false under impersonation (`packages/authz/src/index.ts:273`). So this is not currently exploitable and is recorded as defence in depth only: the database layer would not catch a future route whose gate drifted below super admin.
**Suggested fix:** Call the RPC with the user client at both sites so both layers are live, as the already-decided follow-up in the archived plan describes. The guards that do not read `auth.uid()` (expected-updated-at, self-action, last-super-admin) are unaffected either way.
**Resolution:**
