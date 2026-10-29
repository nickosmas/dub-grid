# Feature: The correction itself

**From build-plan:** feature 53a (item 53, Past-day corrections)
**Status:** verified

## Goal

A manager can fix a day that has already happened: the published cell for
one person on one past day changes at once, with a reason, and nothing else
moves. Nobody is alerted, the schedule's publish record is left as it was,
and the change is kept as a correction with Before, After, the reason and who
made it.

53a is the server side only: a database function, a route action, the shared
reason list, and the activity-log row. 53b builds the grid and Correct this
day on top of it; 53c shows the Corrected mark and the log entry.

## Design reference

None for 53a (no UI). The panel 53b builds follows the inline prototype the
owner reviewed on 2026-10-28: shift and absence pickers, reason chips (Called
off, Left early, Swapped with someone, Wrong shift recorded, Other with a
note), and a Before and After box.

## Decisions made (owner, 2026-10-28)

- **Permission:** Edit shifts and Publish schedule, both. A Super Admin and
  a Gridmaster impersonating the organization have both.
- **Window:** a day from 14 days before today up to yesterday, in the
  organization's timezone; an earlier day needs a Super Admin (or a
  Gridmaster impersonating). Today and later are never corrected; they use
  the draft.
- **Record:** each correction is a row in its own table, never in Publish
  History, so Publish History keeps what each publish wrote, its 100-row
  trim is untouched, and the mobile "changed" badges that read it don't
  flag corrected days.
- **No alert, no broadcast:** the route never calls the publish alerts and
  never sends `schedule_published`; the existing table-change invalidation
  refreshes open grids.
- **Draft:** the correction discards that cell's draft first (086's
  `discard_schedule_cell_draft_internal`), so a later publish can't copy an
  older draft over it.

## Decisions made here (to confirm at review)

- **Only published days.** A correction needs the day to fall inside a
  published period (a `publish_history` range covering it); otherwise it is
  refused with "This day was never published." A past day that was never
  published has nothing for staff or reports to fix.
- **Who could have worked it.** A correction is allowed for someone who could
  have been scheduled that day: not offboarded, on or after their first day,
  and, when Away now, before the day they went away (`status_changed_at` in
  the organization's timezone, as the Away bar fix uses) or from their return
  date. Suspension never blocks a day. Offboarded people stay out of scope.
- **The gate trigger.** `refuse_unschedulable_employee` (100) keeps refusing
  every write it refuses today, except a published snapshot or segment for a
  day before the organization's today, which it checks with the new
  "could have worked" rule instead. Past published writes come only from
  corrections (53b refuses past drafts, and requests refuse past days).
- **Reasons** are fixed keys, stored as text with a CHECK:
  `called_off`, `left_early`, `swapped`, `wrong_shift`, `other`. `other`
  needs a note (trimmed, 1 to 500 characters); the others take an optional
  note of the same length.

## Data and contracts (load-bearing for 53b and 53c)

- **Table `schedule_cell_corrections`:** `id` UUID, `org_id`, `emp_id`,
  `date`, `reason`, `note` (nullable), `before` JSONB and `after` JSONB (the
  published cell payload as `get_schedule_cell_snapshot_payload` returns it,
  or null for an empty cell), `corrected_by` UUID, `corrected_at`
  timestamptz. Append-only: no update or delete grant. RLS lets a member
  with Edit shifts read their organization's rows; only the function writes.
  Index on `(org_id, date)`.
- **Function `correct_schedule_cell(...)`:** the same cell arguments as
  `write_schedule_cell_snapshot` (state kind, segments, absence and its
  times, focus area, mentored flags, expected version), plus `p_reason` and
  `p_note`. SECURITY DEFINER, granted to `authenticated`. Returns the cell's
  new version. Refusals use stable messages the route maps to 4xx:
  `Correction not allowed: <why>`.
- **Function `employee_could_work_on(emp, date)`:** the rule above.
  Revoked from `authenticated`, like `employee_schedulable_on`.
- **Route action `correctShift`** on `/api/schedule/manage`: body
  `{ orgId, employeeId, date, input, expectedVersion, reason, note? }`,
  `input` shaped like `upsertShift`'s. Response as `upsertShift`'s
  (`writeResponse`).
- **Shared reasons:** `CORRECTION_REASONS` in `@dubgrid/domain` with the
  label for each key (Called off, Left early, Swapped with someone, Wrong
  shift recorded, Other), used by the route's Zod schema and later the panel.
- **Audit action `shift.corrected`:** `resourceType: "shift"`,
  `resourceId: "<emp>:<date>"`, details `{ input, before, reason, note }`,
  registered in `lib/audit/registry.ts` so the log can label it.

## Build steps

1. [x] **Migration 110: the correction table and the "could have worked"
       rule.** `supabase/migrations/110_past_day_corrections.sql` creates
       `schedule_cell_corrections` with RLS and `employee_could_work_on`, and
       locks the checksum. A live integration test
       (`migration-110-past-day-corrections.integration.test.ts`) covers the
       rule: before and on a first day, someone Away before and after the day
       they went away and from their return date, Suspended, Offboarded.
       **Done when:** `npm run db:migrations:check` passes, the migration applies
       to the local stack, and the rule's tests pass.
2. [x] **The correction function.** Adds `correct_schedule_cell` to 110:
       permission, organization, the past-day window and Super Admin override,
       published-period check, reason and note, "could have worked", the
       optimistic version (checked before the draft discard, which bumps it),
       draft discard, the published write through
       `write_schedule_cell_snapshot_internal` (which runs the same overlap and
       absence-time checks a save does), and the correction row with Before and
       After. Tests with an Active person: an Admin corrects yesterday and 14
       days ago and is refused 15 days ago while a Super Admin isn't; today and
       a future day are refused; Edit shifts without Publish schedule is
       refused; a draft on the cell is gone afterwards; a never-published day is
       refused; `other` without a note is refused; no `publish_history` or
       `schedule_publish_changes` row is written; a stale version fails.
       **Done when:** those tests pass on the local stack.
3. [x] **Past published writes follow "could have worked".**
       `refuse_unschedulable_employee` checks `employee_could_work_on` for a
       published snapshot or segment dated before the organization's today, and
       `employee_schedulable_on` for everything else, as now. Tests: an Away
       person's day before they went away is corrected and a day after is
       refused; a draft for that same past day is still refused; someone before
       their first day is refused.
       **Done when:** those tests pass and the 067, 099, 100 and 106 suites
       still pass.
4. [x] **Close the published write on the cell-save function.** In 110,
       `write_schedule_cell_snapshot` refuses `p_snapshot_kind = 'published'`
       ("Published cells are written by publishing, approvals and
       corrections"). Its only database caller, `move_shift` (099), passes
       `'draft'`, and approvals use `_internal`. Test: an Edit-shifts member
       calling it with `'published'` through the data API is refused, and
       drafts still save.
       **Done when:** the test passes and every existing schedule integration
       suite still passes.
5. [x] **Reasons, route action and audit row.** `CORRECTION_REASONS` in
       `@dubgrid/domain`; `correctShift` in `/api/schedule/manage` with Zod
       validation, `requireOrgPermissions` for Gridmaster-impersonating, Super
       Admin, or Edit shifts and Publish schedule, the RPC through the user's
       client, refusals mapped to 403 or 409 with their message, and a
       `shift.corrected` audit row with Before. Route tests with mocked Supabase:
       allowed, missing Publish schedule, missing reason, a refusal message
       passed through, and no call to the publish alerts.
       **Done when:** the route tests, `type-check` and `lint` pass.

## Out of scope

- Any UI: the grid, the panel and the past-day locks are 53b; the Corrected
  mark, the activity log rendering and dashboard hours are 53c.
- Correcting Offboarded people, open shifts and schedule notes.
- Changing who can publish, or how Publish History reads.
- Mobile (schedule authoring stays web-only).

## Testing

- Live integration tests against the local stack for migration 110, named
  and structured like `migration-107-*`, with a unique fixture date.
- Route tests with `vi.mock` for Supabase, like the other manage-route tests.
- Full `npm run test:web`, `type-check`, `lint` and `docs:verify` before
  completion; a migration also gets `npm run db:migrations:check`.

## Notes for the AI

- Read the latest definitions: `write_schedule_cell_snapshot` is in 099,
  `_internal` in 092, `refuse_unschedulable_employee` in 100,
  `employee_schedulable_on` in 106, `discard_schedule_cell_draft_internal`
  in 086, the org permission helper in 075.
- The organization's today in SQL is the date of `now()` in
  `organizations.timezone`; never the server's date.
- Never edit an applied migration; 110 is a new forward migration, locked in
  `checksums.sha256`.
- Scope every query by the effective organization id; the route takes it from
  `requireOrgPermissions`, never from the body alone.
- A later migration's rows can fail an older migration's suite on the shared
  local database; use a unique fixture date and run suites serially.
- The Staff management phrasing review session is changing copy in schedule
  files; 53a touches only the manage route among them.

## Completion evidence

- Migration 110 dry-run and applied to the local stack; `db:migrations:check`
  passes with its checksum locked.
- `migration-110-past-day-corrections.integration.test.ts`: 15 cases (the
  "could have worked" rule, the window and Super Admin override, today and
  later, Publish schedule, reason and note, stale version, never published,
  an Away person before and after they went away, a first day, the trigger
  for past published and draft writes, the save guard and the any-kind body).
- The 34 schedule, approval, draft, absence, request and 067 to 109
  migration integration suites (199 tests) pass with 110 applied.
- `route.correct.test.ts` (4 cases) and `schedule-corrections.test.ts` (3).
- `type-check`, `lint` on the changed files, `docs:verify` (two pages
  re-fingerprinted, the generated inventory refreshed) and the full
  `test:web`.
- Not done here: any UI (53b and 53c), and production, which still needs 110
  applied by the owner's migration kit.
