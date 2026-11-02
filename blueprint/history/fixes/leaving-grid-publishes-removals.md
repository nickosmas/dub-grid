# Fix: Leaving the grid publishes the removals

**Type:** Fix
**Status:** verified
**Branch:** `fix/leaving-grid-publishes-removals`

## The problem

When someone leaves Active, migration 067's `clear_schedule_for_departed_employee`
(latest body in `100_away_absence.sql`) turns each published shift from the
organization's today on into a pending removal (a `deleted` draft), "so the next
publish shows the gap". The grid only shows Active people and Away people with a
return date (`scheduleEmployees`, `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:555`).
So for an **Offboarded** person, or someone **Away with no return date**, those
removals:

- count in the Draft changes banner ("4 removed") with no cell to see them in;
- can't be reviewed, and can only go live through a blind publish of the period;
- leave the departed person's shifts on the live schedule for staff until then.

The same happens to the draft removals that a planned away or last day writes
(103, 104) if nobody publishes them before the day the person leaves the grid.

## The fix

Owner decision (2026-10-29): taking someone off the grid publishes their pending
removals at once. This is the one exception to item 51's "schedule changes from a
status go through the draft and publish with the period", and only for people the
grid no longer shows. Someone allowed to change a status without Publish schedule
may therefore change the live schedule, but only by removing the shifts of someone
who has left.

**Off the grid** means the row is archived or Offboarded (`removed`), or Away
(`inactive`) with no `away_until`. In `clear_schedule_for_departed_employee` that
is the existing `v_until IS NULL` branch.

Every path changes status by updating `employees`, so the existing
`trg_clear_schedule_on_employee_departure` trigger (099) is the one choke point.
That covers manual, bulk, Gridmaster's Remove from organization, the last-day
and planned-away steps of `/api/cron/return-from-away`, and clearing a return
date. No route changes.

For someone off the grid, from the organization's today on:

- A cell with a published snapshot is published as removed, whether its draft
  was already `deleted` (103, 104, an earlier departure) or not. Record it the
  way `publish_schedule_unguarded` (092) records a deletion: one
  `schedule_publish_changes` row (`kind = 'deleted'`, `from_state` and the
  `from_*` columns from the published snapshot), then delete the cell.
- All of that person's removals go under one `publish_history` row:
  `published_by` the actor, `start_date` and `end_date` the first and last
  removed day, `change_count` the number of cells.
- A cell with no published snapshot is deleted, as today.
- Days before today and Away with a return date are unchanged.

Must hold:

- **Lock order.** Take `publish_schedule_<org>`'s advisory lock before locking
  cells by id, as publish does, so a concurrent publish or discard waits rather
  than deadlocks.
- **Actor.** `published_by` is NOT NULL. Use `COALESCE(auth.uid(), p_actor_id)`
  (the trigger passes `NEW.updated_by`; the job sets it to `planned_by`). If both
  are null, fall back to today's pending-removal behavior rather than fail the
  status change.
- **No alerts.** Schedule-change alerts are sent by the web publish route (087),
  not the database, so this publish sends none. An offboarded person couldn't
  receive one (51j). An Away person learns from their status, not a "Schedule
  changed" alert.
- **Schedule notes.** Notes belonging to a removed shift go with it, the same way
  they go when a normal publish removes one.
- **Realtime.** Other open schedule tabs refetch on the new `publish_history` row
  like after any publish.
- Recurring schedules, series and requests keep 067/099/100's handling.

**Cleanup of existing leftovers.** The same migration publishes the pending
removals already sitting on off-grid people (published cell from today on with a
`deleted` draft), grouped per person, with `employees.updated_by` as the actor.
Rows with no actor are left and counted in the migration's notice. Before
applying it to production, count the affected people and cells with a read-only
query and report it with the release (see "Production migration" below).

## Build steps

- [x] **1. Migration 114: publish removals on leaving the grid.**
      `supabase/migrations/114_leaving_grid_publishes_removals.sql` replaces
      `clear_schedule_for_departed_employee` (copying 100's body and changing only
      the off-grid branch) and locks its hash in `checksums.sha256`.
      Integration test `apps/web/src/__tests__/migration-114-leaving-grid-publishes-removals.integration.test.ts`
      (modelled on `migration-104-planned-last-day.integration.test.ts`) covers:
  - Offboard: a published shift today and ahead is gone from published, no draft remains, and one history row has a `deleted` change per day, credited to the actor.
  - Mark away with no return date: same.
  - Removing a return date: same.
  - The last-day job offboarding someone whose planned clearing left `deleted` drafts: those days are published as removed.
  - Away with a return date: unchanged (draft removals, 099).
  - A past published day is kept, and no history row is written when nothing is published.
  - With no actor: falls back to pending removals.
  - The loop no longer locks a person's whole history (F-174): a past day is
    touched only when it holds a draft or has nothing published.

  Drafted as 113 on 2026-10-29; renumbered 114 on 2026-11-02 because 113
  shipped first (invite admin permissions).

  **Done when:** the test passes and `npm run db:migrations:check` is clean.

- [x] **2. Cleanup of existing leftovers.** In the same migration, run the
      off-grid publish once for every off-grid person with a pending removal from
      today on. Extend the test: a seeded leftover (offboarded, published shift
      ahead, `deleted` draft) is published by the migration's block. Write the
      read-only count query in the release note's place.
      **Done when:** the test passes, and a local `db:migrations:rehearse` from 113
      runs clean.

- [x] **3. Docs.** `docs/staff/roster.mdx:79` says published shifts "are marked for
      removal at the next publish". Change it: for someone offboarded or away with no
      return date, their published shifts from today on are taken off the published
      schedule right away and show in Publish History; their past schedule is kept.
      Update the line in `blueprint/context/project-overview.md` item 51 if it needs
      to. Refresh the page's fingerprint (`npm run docs:fingerprint`).
      **Done when:** `npm run docs:check` passes.

## Also changed

- The status confirmations (shared copy in `@dubgrid/domain`) said upcoming
  shifts "come off the schedule in the draft". Offboard, Mark away with no
  return date, clearing a return date and Gridmaster's Remove from
  organization now say they come off the published schedule now; a planned
  away with no return date and a last day say when they come off the
  published schedule.
- `docs/staff/roster.mdx` says the same for planned changes.

## Verify

Done 2026-11-02: migration suites 099 to 114 (51 tests), the domain copy tests,
type-check, docs check, a rehearsal from 113, and in the browser as
`qa-super-admin@dubgrid.test`: offboarding a person with seven published days
left the Draft changes banner unchanged, took the shifts off the grid, and
Publish History listed one entry, "7 changes for 1 employee, 7 removed".

- `npm run type-check`, `npm run lint`, `npm run test:web` (the new
  integration test in isolation too), `npm run db:migrations:check`.
- In the browser, as `qa-super-admin@dubgrid.test`: give someone a published
  shift this week and next, offboard them, return to Schedule. No Draft changes
  banner appears for them, the published schedule no longer shows their shifts,
  and Publish History lists one entry with their removed days. Repeat with Mark
  away and no return date. Mark away with a return date still shows its draft
  days in the grid, to publish with the period.

## Production migration

This adds migration 114. Before merging the release PR, run
`npm run db:migrations:inspect`, report the cleanup count, and follow
`internal/operations/production-migration-safety.md`.

Read-only count of what the one-time block publishes (people, cells, and people
left pending because no one is credited):

```sql
SELECT count(DISTINCT e.id) AS people,
       count(*) AS cells,
       count(DISTINCT e.id) FILTER (WHERE e.updated_by IS NULL) AS people_left_pending
FROM public.employees e
JOIN public.organizations o ON o.id = e.org_id
JOIN public.schedule_cells c
  ON c.emp_id = e.id AND c.date >= (now() AT TIME ZONE o.timezone)::date
JOIN public.schedule_cell_snapshots d
  ON d.cell_id = c.id AND d.snapshot_kind = 'draft' AND d.state_kind = 'deleted'
JOIN public.schedule_cell_snapshots p
  ON p.cell_id = c.id AND p.snapshot_kind = 'published'
WHERE e.archived_at IS NOT NULL
   OR e.status = 'removed'
   OR (e.status = 'inactive' AND e.away_until IS NULL);
```

## Out of scope

- Pending removals on days before today for someone off the grid (past days
  change only through Correct this day).
- Showing people off the grid in the grid.
- A schedule-change alert for the person who left.
