# Feature: Last day

**From build-plan:** feature 51g2 (item 51g, Dated status changes)
**Status:** verified

## Goal

A manager can set someone's last day ahead: Offboard, Last day Sun, Nov 8.
Until then they stay as they are and work as usual. The days after Nov 8 are
locked at once, their shifts there come off in the draft, and nobody can
schedule them past it. On Mon, Nov 9 in the organization's timezone the daily
job offboards them the way a manual Offboard does.

This reuses 51g1's planned change (`planned_*` on the employee, one per
person, the planned-days draft rewrite and the daily job) with a second
planned status, `removed`.

## Design reference

No new board. Built from 51g1's Change status dialog, status card and
planned card, and the grid's Away bar (memory: "days after a last day" draw as
one bar per week like the Away bar).

## Decisions made (owner delegated, 2026-10-28)

- **Storage:** `planned_status = 'removed'`, `planned_from` = the day after
  the last day, `planned_until` and the absence empty. `planned_from` stays
  "the change's first day" everywhere, so the lock, the draft rewrite and the
  job need no special case; the UI shows the last day as `planned_from - 1`.
- **Last day range:** today up to 365 days ahead, like 51g1's Starts. Today is
  allowed: they work today and are offboarded tomorrow. Empty means Offboard
  now, unchanged.
- **One plan per person (51g1):** a last day replaces a planned away, and
  planning an away, marking them away now or suspending them cancels a last
  day; each confirmation says so. Reason: 51g1's rule that any other status
  change replaces the plan, and one row of `planned_*` columns.
- **Who can have one:** someone Active and not suspended, as 51g1 requires;
  a suspended or Away person is offboarded now only. Unlike Away, someone not
  on the schedule can have a last day (Offboard never needed it).
- **While a last day is planned:** Offboard is not offered again in the list;
  Edit plan changes the last day or cancels it, and clearing the date
  offboards them now, as 51g1's Starts does for Away.
- **Moving the last day later or cancelling it:** shifts already taken off
  stay off, as with a cancelled planned away without an absence.
- **Guards at planning:** the same as Offboard: permission, self, tier, last
  Super Admin, and fresh proof for a Gridmaster.
- **The job:** the return-from-away job, behind its flag, offboards each due
  plan through the same update a manual Offboard makes (status, archived_at,
  the note, `updated_by` the planner, so 067's clearing credits them), then the
  same follow-up: sessions revoked and, when the planner is a Super Admin of
  the organization or a Gridmaster, the membership ended (today's rule,
  51k unifies it). It skips anyone who is now the organization's only Super
  Admin and keeps their plan, so it retries daily.
- **Grid:** days after a last day draw as one neutral bar per week labeled
  "Offboarded", locked with "Last day Sun, Nov 8. Change the last day on
  their record to change these days."
- **Not suggested:** Auto-build's Not suggested says "last day Nov 8".
- **The job's record:** the offboarding row has no actor, like the job's
  other rows, and carries the last day, so the activity log reads "Barbara
  Trent was offboarded after their last day, Oct 29". Planning, moving and
  cancelling a last day get their own rows (`employee.last_day_set`,
  `employee.last_day_changed`, `employee.last_day_cancelled`).
- **Naming:** the plumbing that carried a planned Away (`onSetPlannedAway`,
  `setEmployeePlannedAway`) now carries either plan and is named for a
  planned change, as 51g1 asked.
- **Copy:**
  - planned card and status box: "Leaving Sun, Nov 8", detail "Offboarded on
    Sun, Nov 9.";
  - pill text and record: "Leaving Nov 8";
  - Offboard with a last day: button **Set last day**, message "They stay
    Active through Sun, Nov 8, their last day.", points: shifts after it come
    off in the draft, open requests for days after it are closed, and on
    Nov 9 they're offboarded (sign-in and recurring schedules end);
  - editing: **Save changes** / **Cancel last day**.

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`: `PlannedStatus`
      adds `removed`; `isSchedulableOn` refuses days from a planned last day
      on; `plannedLastDay`, `isValidLastDay`, `LAST_DAY_INVALID_*`; status box,
      card, mark and pill text for a last day; `describeStatusAction("archive")`
      with `lastDay`, `setPlannedChange` and `cancelPlannedChange` for a last
      day, and the "is cancelled" point named by plan kind; `statusChoices`
      leaves out Offboard while a last day is planned. _Done when:_ domain
      tests cover each.
- [x] **Step 2 - Migration 104.** Widen `employees_planned_status_known`, a
      last day has no until, `employee_schedulable_on` and
      `rewrite_planned_away` treat `removed` like `away` with no end. _Done
      when:_ `db:migrations:check` passes and a live test shows the days after
      the last day refuse a shift, planning clears only those days and closes
      their requests, a planned away replaced by a last day puts its absence
      days back, and offboarding on the day clears nothing more than 067 does.
- [x] **Step 3 - Server.** Types and contracts take `removed`; the web route
      and `mobile-api-core` accept `lastDay` on `remove` and on
      `setPlannedChange` for a last day; audit rows
      `employee.last_day_set`, `employee.last_day_changed`,
      `employee.last_day_cancelled`; the Offboard follow-up (sessions,
      membership) moves to one server helper. _Done when:_ route tests on both
      paths.
- [x] **Step 4 - The daily job** offboards due last days. _Done when:_ cron
      route tests: due today, not yet due, only Super Admin skipped,
      membership ended for a Super Admin planner only.
- [x] **Step 5 - Grid and planners.** `awayRangeOf` gives a leaving range,
      the bar and hint read for it, Not suggested names the last day. _Done
      when:_ grid helper and suggestion text tests.
- [x] **Step 6 - Web.** Change status: Offboard gets a Last day field; Edit
      plan edits or cancels it; the status card, People list, record and
      Gridmaster card show "Leaving Nov 8". _Done when:_ component tests and
      screenshots.
- [x] **Step 7 - Mobile.** The Change status sheet's Offboard gets the Last day
      row, plan editing handles a last day. _Done when:_ screen tests.
- [x] **Step 8 - Docs.** Roster guide: a last day. _Done when:_
      `npm run docs:check` passes.

## Out of scope

- Suspended until and First day (51g3, 51g4); bulk (51h); one Archive (51k).
- A last day for someone Away or Suspended.
- Restoring shifts a moved or cancelled last day took off.

## Testing

- Live integration test for 104 (BEGIN/ROLLBACK); 103's still passes.
- Domain, route, cron, grid, component and screen tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- `employee_schedulable_on` decides schedulability for every RPC; re-run the
  099 to 103 integration tests after changing it.
- `rewrite_planned_away` returns early once offboarded, so the job's offboard
  leaves the days to 067's clearing.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint` (two old `<img>`
  warnings, none new), `npm run test:mobile` (mobile 1,543 and every package),
  `npm run test:web` (6,659 tests; the first run failed four that pinned the
  old Offboard arguments and the route's inline sign-out, fixed by passing a
  last day only when set and classifying `endOffboardedAccess` and the daily
  job in the sensitive-action boundary test, then re-run), `npm run docs:check`
  and `npm run db:migrations:check`.
- Migration 104 integration test (8) on the local stack, with 099 to 103's
  beside it; 104 applied to the local database only.
- Browser, on local Calm Haven data as the QA Super Admin: Offboard with Last
  day Thu, Oct 29 for Barbara Trent; she stayed Active with a dashed "Leaving
  Thu, Oct 29 / Offboarded on Fri, Oct 30." card, the People list showed
  "Leaving Oct 29", the grid drew "Offboarded" from Fri, Oct 30, and Edit plan
  opened "Change Barbara Trent's last day?". The last day was then cancelled
  through the dialog and her cleared draft days put back by hand.
- Live job run: a throwaway Calm Haven person with a last day of yesterday was
  offboarded by `GET /api/cron/return-from-away` (`offboarded: 1`), credited to
  the planner, with the note and an `employee.removed` row naming the last
  day; the fixture was then deleted.
- Not taken: a simulator screenshot of the mobile sheet; its screen tests
  cover setting, moving, cancelling and clearing a last day.
