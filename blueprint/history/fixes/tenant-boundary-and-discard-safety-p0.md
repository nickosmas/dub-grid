# Tenant boundary and discard safety: the three P0 audit findings

**Type:** Fix

**Status:** verified

**Fixes:** F-01, F-02, F-03

## The problem

The 2026-09-21 full-project audit found three P0 defects. All three sit on
the tenant boundary or on published schedule data, and all three block
`/complete` until repaired and re-reviewed.

- **F-01, sandbox-scoped requests act on the wrong organization.** Several
  service-role routes call `requireOrgPermissions`, which resolves the
  effective (Test Sandbox) organization and returns it as `auth.orgId`, and
  then keep using the request body's raw `orgId` for reads, writes and audit
  rows. Named sites: `apps/web/src/lib/audit/authorize.ts` (the reader never
  returns the effective id, so both audit-log endpoints filter by the raw
  one), `apps/web/src/app/api/import/employees/route.ts`,
  `apps/web/src/app/api/shifts/publish/route.ts`,
  `apps/web/src/app/api/shifts/discard/route.ts`. The audit also names
  reports, exports and publish history, so the sweep must cover every route
  with the same pattern, not only the four listed.
- **F-02, schedule child rows can point at another organization's cell.**
  `schedule_cell_snapshots.cell_id` and `schedule_cell_segments.snapshot_id`
  are plain foreign keys; the write policies check only the child's own
  `org_id`. A snapshot whose `org_id` matches the caller but whose `cell_id`
  belongs to another organization is accepted, and
  `get_schedule_cell_snapshot_payload` joins parent to child without
  comparing organizations, so the mismatched child shapes the other
  organization's canonical read.
- **F-03, discard can delete a cell that was just published.**
  `discardScheduleDraftsDirect` in
  `apps/web/src/lib/server/schedule-draft-safety.ts` selects draft-only
  cells with one query, then deletes their parent rows with later queries.
  A publish that promotes a selected cell in between makes the delete remove
  published data. Nothing locks or rechecks.

## The fix

- **F-01:** every route that authorizes through `requireOrgPermissions`
  uses `auth.orgId` for everything downstream and never the parsed body or
  query value again. `authorizeAuditLogRead` returns `orgId` alongside the
  client and audience so both audit-log endpoints filter by it. A static
  boundary test (pattern: `apps/web/src/__tests__/*-boundaries.test.ts`)
  scans every route file that calls `requireOrgPermissions` and fails when
  the raw identifier is referenced after the call, so the class of bug
  cannot return. Behaviour for non-sandbox callers is unchanged, because the
  effective id equals the requested one.
- **F-02:** forward migration 032 enforces organization consistency at the
  relationship layer: a unique key on `schedule_cells (id, org_id)` and on
  `schedule_cell_snapshots (id, org_id)`, then composite foreign keys
  `schedule_cell_snapshots (cell_id, org_id)` and
  `schedule_cell_segments (snapshot_id, org_id)` referencing them. The two
  `admin_write_*` policies gain an `EXISTS` check that the parent shares
  the organization, so the error is a policy refusal rather than a
  constraint message. `get_schedule_cell_snapshot_payload` (and any sibling
  reader that joins cell to snapshot to segment) adds
  `snapshot.org_id = c.org_id` and `segments.org_id = snapshot.org_id` to
  the joins, copied from the latest migration that defines it, never from
  002 if a later one restates it. Before adding the keys the migration
  asserts no mismatched rows exist and raises if any do, so a drifted
  production database is reported rather than silently constrained.
- **F-03:** discard becomes one database transaction: a service-role-only
  SQL function `discard_schedule_drafts(p_org_id, p_user_id, p_start_date,
p_end_date)` that locks the candidate cells `FOR UPDATE`, deletes draft
  snapshots, deletes only parent rows that still have no published snapshot
  at that moment, bumps the version of the rest, and reverts or removes
  draft notes, all in the same statement set. The route keeps the
  pre-discard breakdown read for the audit row and calls the function
  through the service client; the function is not granted to
  `authenticated`, so the SQL inventory tests stay as they are. The
  TypeScript helper keeps its breakdown query and loses its deletion path.

Must not break: manual and auto approval of shift requests (which write
snapshots through `write_schedule_cell_snapshot_internal`), publish, the
sandbox clone, the seed, and the existing discard and publish route tests.

## Build steps

- [x] **1. Effective organization everywhere (F-01)** - sweep every
      `requireOrgPermissions` caller, thread `auth.orgId` through
      `authorizeAuditLogRead`, add the static boundary test and a route test
      per named site proving a sandbox cookie redirects the write. Done when
      the boundary test passes on the whole `apps/web/src/app/api` tree and
      the four named routes' tests show reads and writes against the
      effective organization.
- [x] **2. Organization-consistent schedule children (F-02)** - migration
      032 with the pre-flight assertion, composite keys, policy `EXISTS`
      checks and the reader join guards; checksum; a migration-text test; a
      live-database test that a direct insert of a snapshot under another
      organization's cell is refused for an authenticated admin and by the
      key for the service role. Done when `npm run db:migrations:check` and a
      clean local reset pass and the new tests are green.
- [x] **3. Transactional discard (F-03)** - `discard_schedule_drafts` in
      the same migration 032, the route and helper rewired, a live-database
      test that a cell published after selection survives a discard and a
      cell still draft-only is removed, plus the existing discard route
      tests updated to the RPC. Done when those tests pass and a browser
      discard of a draft week behaves as before.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` and the live
  integration tests against the seeded local stack, from a worktree.
- Browser: sign in as `qa-super-admin@dubgrid.test` on Calm Haven, enter
  the Test Sandbox, import a two-row CSV, publish a week, discard a draft;
  leave the sandbox and confirm the real organization's people, schedule and
  audit log are untouched. Then, outside the sandbox, make a draft edit,
  publish it in a second tab, discard in the first, and confirm the published
  cell survives.
- `/audit` afterwards to move F-01, F-02 and F-03 from `fixed` to `closed`.

**Completed:** 2026-09-22 in commit `77752384` on `origin/dev` (31 files). Status
`verified`: type-check, lint, the full web and mobile suites, three clean local
resets applying migration 032, and a browser discard with a cell published out
from under the open dialog. `/audit` re-reviewed the three repairs the same day
and closed F-01, F-02 and F-03 in the ledger; the closed entries remain in
`findings.md` for `/complete` to archive. Archived as written to free the active
slot for the P1 repairs, since `/complete` cannot run while P1 findings are open.
