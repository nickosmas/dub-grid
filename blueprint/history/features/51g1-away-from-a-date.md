# Feature: Away from a date

**From build-plan:** feature 51g1 (item 51g, Dated status changes)
**Status:** verified

## Goal

A manager can book someone's leave ahead: Away from Mon, Nov 10, back Mon,
Jan 4. Until Nov 10 they stay Active and work as usual. The days from Nov 10
are locked at once, their shifts there come off in the draft (under the
chosen absence when one is picked), and a daily job marks them Away on
Nov 10 in the organization's timezone. From then on, 51e's Away-until rules
apply unchanged.

This part also builds the planned change that 51g2 (Last day), 51g3
(Suspended until) and 51g4 (First day) reuse.

## Design reference

No new board. It is built from the 51d Change status dialog and the 51e and
51f fields:

- a **Starts** date picker above Return date;
- the planned change shown under the current-status box;
- the grid's Away bar starting on the start date.

The status line, pill and dialog copy follow the owner's dialog rules:

- the title names the thing;
- a message appears only when it adds something;
- no person names outside the title;
- no caption repeats the choice.

## Decisions

- **Storage:** a planned change lives on the employee row, at most one per
  person:
  - `planned_status` (`away` only in this part; 51g2 and 51g3 widen the
    check);
  - `planned_from` (its first day);
  - `planned_until` (first day back, optional);
  - `planned_absence_type_id`, `planned_note`, `planned_by`.
  - A planned change needs an Active, unarchived, unsuspended person and a
    `planned_from` after today in the organization's timezone.
- **Start today:** Mark away with Starts = today, the default, works exactly
  as now. Only a later start stores a planned change. The start must be
  within 365 days.
- **Return date:** optional with a later start, as it is today. Without one,
  the job marks them Away indefinitely on the start date, and their
  recurring schedules are archived then, as today.
- **Before the start:** they stay Active, schedulable and billed as they are
  now.
  - `employee_schedulable_on` and the domain's `isSchedulableOn` refuse
    dates from `planned_from` up to `planned_until` (or onward when it is
    empty).
  - Every RPC and planner that asks these refuses or skips those days,
    unchanged otherwise: Fill from Recurring Schedules, Auto-build and its
    suggestions, open-shift staffing.
- **At confirmation, the draft changes once:**
  - the locked days' shifts come off;
  - the chosen absence fills them, through 51f's fill from the start date;
  - open requests on those days close.
- **Recurring schedules:** they stay as they are and simply skip the locked
  days. They pause or archive only when the job starts the Away, by 51e's
  rules.
- **Editing the plan:** moving either date or changing the absence rewrites
  the days, by the same rules as 51e and 51f. Cancelling it, or suspending
  them, puts days that held its absence back to what was published, and
  leaves days cleared without an absence cleared. Both are in Change status,
  as **Save changes** and **Cancel planned away**.
- **Another change cancels it:** marking them away now, suspending or
  archiving them cancels the plan, and the confirmation says so.
- **The daily job:** the existing return-from-away job, behind its existing
  flag, also starts each planned change that is due, in each organization's
  timezone. It sets status Away, `away_until` from `planned_until`, the
  absence and the note, and clears the plan. A plan whose return date has
  already passed when the job reaches it is dropped. Suspending someone
  clears their plan, so the job never meets a suspended person with one; it
  skips them anyway, as a guard.
- **Copy:**
  - status box: "Active", detail "Away from Mon, Nov 10, back Mon, Jan 4."
    (or "Away from Mon, Nov 10." without a return date);
  - pills stay Active; a muted "Away from Nov 10" shows under the name in
    the web People list (whose status column shows only on All) and beside
    the name in the mobile People row, and the person record and the
    Gridmaster card add a Planned field ("Away from Nov 10, back Jan 4");
  - the confirm button reads **Mark away** for a start of today and
    **Schedule away** for a later start;
  - the Mark away points name the start: "They stay Active until Mon,
    Nov 10." Then come 51e's and 51f's points, dated from the start.
- **Staff:** they see only their state and its date, on mobile and in
  their alerts. Staff copy calls the product "the app".

## Build steps

- [x] **Step 1 - Shared rules and copy.** In `@dubgrid/domain`:
  - `SchedulableState` and `isSchedulableOn` take the planned change.
  - `describeCurrentStatus` gives the planned-away detail.
  - A `describePlannedChange` gives the muted pill text.
  - `describeStatusAction("markAway")` takes a start date: points and the
    **Schedule away** label for a later start.
  - New copy for `setPlannedChange` (Save changes) and `cancelPlannedChange`
    (Cancel planned away).

  _Done when:_ domain tests cover today and a later start, with and without
  a return date and an absence, the box detail, the pill text, and
  schedulability before, inside and after the range.

- [x] **Step 2 - Migration 103.**
  - The `planned_*` columns, their check constraints, and the 101 guard
    trigger extended: leaving Active, archiving or suspending clears the
    plan.
  - `employee_schedulable_on` refuses planned days.
  - A trigger on a planned change's insert, update or clear rewrites the
    draft, reusing `clear_schedule_for_departed_employee`'s cell-clearing
    with a `planned_from` lower bound and 51f's `fill_away_absence` and
    `unfill_away_absence`. It also closes open requests on the planned days.
  - Lock the checksum.

  _Done when:_ `npm run db:migrations:check` passes, and a live
  integration test shows:
  - planned days refuse a shift while earlier days take one;
  - confirming clears and fills only the planned days;
  - moving and cancelling rewrite them;
  - starting the plan (the job's one update) leaves the days alone;
  - suspending clears the plan.

- [x] **Step 3 - Server and types.**
  - `plannedStatus`, `plannedFrom`, `plannedUntil` and
    `plannedAbsenceTypeId` go on `Employee`, `DbEmployee`, the mappers,
    every `EMPLOYEE_COLS`, and the mobile contracts and mappers.
  - The web status route and `mobile-api-core` accept an optional
    `startDate` on `deactivate`. A later start stores the plan, with no
    status change.
  - New `setPlannedChange` and `cancelPlannedChange` actions, with the same
    permission, self, tier and fresh-proof guards.
  - `suspend`, `remove` and `deactivate` today cancel a plan.
  - Validation: start after today and within 365 days, return after the
    start, someone on the schedule; 400 with a domain code otherwise.
  - Audit rows `employee.away_planned`, `employee.away_plan_changed` and
    `employee.away_plan_cancelled`.
  - Load-bearing: these four fields and the two actions are what 51g2 to
    51g4 extend. Name them for any planned status, not for Away.

  _Done when:_ route tests on both paths cover each action and refusal.

- [x] **Step 4 - Planners.** Fill from Recurring Schedules (server and
      client), Auto-build, its suggestions and open-shift staffing skip planned
      days through `isSchedulableOn`. _Done when:_ planner tests show planned
      days skipped and earlier days filled.
- [x] **Step 5 - The daily job.** `GET /api/cron/return-from-away` first
      starts each due plan the way it returns people: one version-guarded
      update per person (status Away, `away_until` and the absence from the
      plan, the plan cleared), an audit row, and the employees cache
      cleared. It reports both counts. _Done when:_ route tests cover a plan
      due today, one due tomorrow where the organization's day has already
      turned, the flag off, and a failed start that still lets returns run.
- [x] **Step 6 - Web.**
  - In Change status, Away gets **Starts** (today by default, up to a year
    ahead) above Return date.
  - For someone with a plan, the plan's dates and absence sit under the
    status box with **Save changes** and **Cancel planned away**.
  - People list shows the muted "Away from Nov 10" under the name; the
    person record and the Gridmaster person card show a Planned field.
  - Found while checking it: a long confirmation opened scrolled to its
    end, because 51d focuses Cancel inside the scroll area. Modal now
    focuses it without scrolling.
  - The grid draws the Away bar and locks days from `planned_from`
    (`buildRowAwayDays` takes a start).

  _Done when:_ component and grid tests; screenshots of the dialog, the
  record and the grid.

- [x] **Step 7 - Mobile.** The person page's Change status sheet gets the
      Starts row and the planned-away editing, and the People row shows the
      muted text. _Done when:_ screen tests; a simulator screenshot (not
      taken: screen tests cover it).
- [x] **Step 8 - Docs.** The roster guide's "Away until a date" becomes Away
      with dates (start and return), and the schedule grid guide notes planned
      days. _Done when:_ `npm run docs:check` passes.

## Out of scope

- Last day, Suspended until, and First day (51g2 to 51g4). This part adds
  only `away` to `planned_status`.
- Planning a change for several people at once (51h).
- Restoring shifts a cancelled plan cleared. They stay cleared, as with 51e's
  return date today.
- A new alert or email to the person when leave is planned. Their schedule
  change shows through the normal publish.

## Testing

- Live integration tests for migration 103 (BEGIN/ROLLBACK, unique fixture
  dates, lock first).
- Domain, route, planner, cron, component and screen tests; screenshots.
- Final gate:
  - `npm run type-check`, `npm run lint`, `npm run test`;
  - `npm run docs:check`, `npm run db:migrations:check`;
  - `npm run db:migrations:rehearse -- --from 102`.

## Notes for the AI

- `employee_schedulable_on` is the one place the database decides
  schedulability; every RPC asks it, so changing it changes them all.
  Re-run the 099, 100 and 101 integration tests after.
- `clear_schedule_for_departed_employee` and `rewrite_away_absence` read
  only inactive people's dates. Give the planned path its own entry points
  rather than widening those conditions, and diff any restated body against
  100's.
- The 101 guard trigger (`clear_away_until_off_away`) runs on every status
  write. Extend it carefully so a planned change survives an Active
  person's ordinary edits.
- Stage exact paths; another session may share the root checkout.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint` (two old `<img>` warnings, none new), `npm run test` (mobile 1,532, web 6,599, every package), `npm run docs:check` and `npm run db:migrations:check` passed.
- Migration 103 integration test (8) on the local stack; the 099 to 102 tests still pass beside it.
- Browser, on local Calm Haven data: scheduled an away from Mon, Nov 2 to Mon, Nov 9 with Vacation through Change status; Richard Bennett stayed Active, Nov 2 to 8 held Vacation in the draft, the record showed "Planned: Away from Nov 2, back Nov 9", the grid drew "Away · Vacation" from Nov 2, and the People list showed "Away from Nov 2". The plan was then cancelled.
- Found and fixed: a long confirmation opened scrolled to its end, because 51d focuses Cancel inside the scroll area; Modal now focuses without scrolling.
- Not taken: a simulator screenshot of the mobile sheet; its screen tests cover scheduling and cancelling.
