# Feature: Away until a date

**From build-plan:** feature 51e (item 51, Staff statuses)
**Status:** in progress

## Goal

A manager marking someone away can give a return date. The person is off the
schedule until then and schedulable again from that date, even while still
Away; a daily job sets them back to Active on the day in the organization's
timezone. Their recurring schedules pause while they're away instead of being
archived, and fill again from the return date. People see "Away until Jan 4",
and the grid shows the away days as one Away bar per week.

## Design reference

The "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo): Person page status card
("Away until Jan 4: Can sign in. Not scheduled until Mon, Jan 4, then back to
Active and their recurring schedule resumes."), Confirmations (Return date
field: "They're back to Active on this day. Leave it empty to mark them active
yourself."), Web People list and Mobile People list pills, Schedule grid board
(status runs drawn as one bar per week, no lines inside). Confirmation copy
follows the owner's dialog rules (title names the thing, message only when it
adds, an unlabelled box of two or more full sentences, no person names outside
the title).

## Decisions

- The return date is the first day back (`away_until`, a date). It's
  optional; without it, Away works as today (indefinite, recurring archived).
- "Schedulable from that date" is per date: someone Away until Jan 4 can be
  scheduled on Jan 4 and later, and nothing before. Every database check that
  today requires `status = 'active'` asks one helper instead:
  `employee_schedulable_on(emp_id, date)`.
- Marking away with a return date clears only days before it, pauses recurring
  schedules (kept, not archived) and leaves shift series dated after it alone;
  open requests for days before it are closed. Changing the date later
  re-applies the same rule for the new range. Removing it makes them
  indefinitely Away (today's full clearing).
- The daily job runs once a day (Vercel cron) and returns anyone whose
  `away_until` is on or before today in their organization's timezone:
  status Active, note cleared, `away_until` cleared. It is behind a new
  platform flag, `cron_return_from_away`, on by default.
- Setting a return date is on web and mobile.
- The grid shows Away people who have a return date inside or after the
  period, with their away days drawn as one "Away" bar per week (the item 52
  run builder) and their days from the return date normal and schedulable.
  Indefinitely Away people stay off the grid, as today.

## Build steps

- [x] **Step 1 - Migration 099.** Add `employees.away_until DATE`; add
      `employee_schedulable_on(p_emp_id uuid, p_date date) returns boolean`
      (active and not archived, or inactive with `away_until <= p_date`);
      use it in the 067 write gate (`refuse_unschedulable_employee`, with
      the date of the row; recurring templates and series of a person with a
      return date pass) and in every RPC that checks
      `status = 'active'` (latest bodies: `write_schedule_cell_snapshot`
      092, `create_shift_series` 080, `reschedule_shift_series` 090,
      `move_shift` 092, `import_previous_schedule` 092,
      `create_shift_request_unguarded`, `volunteer_for_open_shift_unguarded`,
      `resolve_shift_request_unchecked` 093), changing nothing else in them;
      give `clear_schedule_for_departed_employee` an upper bound (dates
      before `away_until` when set) and pause instead of archive when a
      return date is set; re-run it when `away_until` changes on an Away
      person; seed the `cron_return_from_away` flag. Lock the checksum.
      _Done when:_ `npm run db:migrations:check` passes and a live
      integration test shows: an Away-until person can be scheduled on and
      after the date and not before; marking away with a date keeps cells
      on and after it and recurring templates unarchived; extending the date
      clears the newly covered days; removing the date archives recurring.
- [x] **Step 2 - Server and types.** `awayUntil` on `Employee`,
      `DbEmployee`, mappers, every `EMPLOYEE_COLS`, the mobile contracts and
      mappers. The web status route and the mobile status path accept an
      optional `returnDate` on Mark away (a date after today in the
      organization's timezone; 400 otherwise) and a new `setReturnDate`
      action for an Away person (set, change or clear). Activate clears it.
      Fill from Recurring Schedules (server and client planner) and
      Auto-build fill an Away-until person only from the return date.
      _Done when:_ route and planner tests cover each case.
- [x] **Step 3 - Daily job.** `GET /api/cron/return-from-away` (CRON_SECRET,
      flag, service client, per-organization today via the organization
      timezone, batch), added to `apps/web/vercel.json`. _Done when:_ route
      tests cover auth, the flag, a person due today, one due tomorrow in a
      timezone where it's already tomorrow, and nobody due.
- [x] **Step 4 - Status copy and dialogs.** `describeStatusAction` takes an
      optional return date: the Mark away message and points name what
      changes before and after it (shifts before Jan 4 come off, recurring
      schedules pause and fill again from Jan 4). Web Mark away dialog gets
      an optional Return date (`CalendarDatePicker`, from tomorrow, "They're
      back to Active on this day. Leave it empty to mark them active
      yourself."); mobile's status sheet gets a date row with a small date
      sheet built on `buildScheduleMonthDays`. An Away person's actions
      include Set return date / Change return date. _Done when:_ component
      tests on both platforms; screenshots.
- [x] **Step 5 - Pills and record.** `describeEmploymentStatus` gains the
      dated form ("Away until Jan 4"); web People list and person record,
      Gridmaster, and a mobile People row pill show it. _Done when:_ tests
      and screenshots.
- [x] **Step 6 - Grid Away bar.** (After item 52 is merged.) Away people
      with a return date appear in the grid; their away days draw as one
      "Away" bar per week with the item 52 run builder and can't be
      scheduled; days from the return date work normally. _Done when:_
      ScheduleGrid tests and a screenshot.

## Out of scope

- An absence type filling the away days (51f).
- Suspended, last day, bulk (51c, 51d, 51g, 51h).

## Testing

- Live integration tests for migration 099 (BEGIN/ROLLBACK, unique fixture
  dates, lock first).
- Route, planner, cron and component tests; screenshots.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`, `npm run db:migrations:check`, and
  `npm run db:migrations:rehearse -- --from 098`.

## Notes for the AI

- Copy every RPC body verbatim from its latest migration and change only the
  schedulability check; a missed copy or a changed line elsewhere is the main
  risk. Diff each new body against the old one.
- `refuse_unschedulable_employee` must still let `state_kind='deleted'` and
  archived rows through.
- No person names in dialog messages or points; titles may name them.
