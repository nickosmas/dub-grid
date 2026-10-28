# Feature: First day

**From build-plan:** feature 51g4 (item 51g, Dated status changes)
**Status:** verified

## Goal

A manager adds a new hire with a first day: Add Staff Members, First day
Mon, Nov 10. They are Active from the start and can sign in, but nobody can
schedule them before Nov 10: the database refuses it, and the grid draws the
days before it locked, one bar per week labeled "Starts Nov 10". The People
list, the status card and the record say "Starts Nov 10" until then, on web
and mobile. On Nov 10 nothing needs to happen: the label stops showing and the
days from then were always schedulable.

The first day is a fact about the person, so it is its own column
(`employees.first_day`), not 51g1's planned change: a new hire can still have
a planned away or a last day, and the date stays on their record after it
passes. Completing it completes 51g.

## Design reference

No new board. Built from 51g1's dashed planned card, the grid's Away and
Offboarded bars (51e, 51g2), and the muted "Away from Nov 10" text in the
People list.

## Decisions made (owner delegated, 2026-10-28)

- **Storage:** a new nullable `employees.first_day` (DATE), the first day they
  can be scheduled. No hire or start date existed to reuse. Reason: one plan
  per person (51g1) would stop a new hire from also having a planned away or
  last day, and a first day is a lasting fact, not a status change.
- **Rule:** no day before `first_day` can be scheduled, whatever else is true;
  `employee_schedulable_on` and the domain's `isSchedulableOn` refuse it, so
  draft saves, Fill from Recurring Schedules, Auto-build and its suggestions,
  open shifts and requests all follow. Empty or in the past changes nothing.
- **Dates:** optional, any past day, and up to a year ahead (51g's limit), on
  Add Staff Members and the person form on the web. A date further out is
  refused with `FIRST_DAY_INVALID`; an unchanged date is never re-checked, so
  an old record still saves.
- **Mobile:** Add person offers First day from today up to a year ahead (a
  past one opens the calendar years back; it's set on the web). The mobile
  edit form doesn't offer it: that save is the one atomic
  `update_mobile_employee_with_audit` call with its audit row, and widening its
  signature means replacing it beside older migrations' tests. Mobile shows
  the first day everywhere it's read.
- **Moving it later on someone already scheduled:** their draft shifts from
  today up to the day before it come off, and open requests on those days
  close, through 103's planned-days clearing. Moving it earlier or clearing it
  puts nothing back, as a cancelled last day (51g2).
- **No job step:** nothing changes on the day itself. Labels compare the first
  day with today; the lock compares it with each date.
- **Sign-in before the first day:** allowed. They're Active, can accept their
  invitation, finish onboarding and see their upcoming schedule; only being
  scheduled waits.
- **Seats:** they take a seat as any Active person does. Reason: a seat
  follows access (51a, 51b), and they can sign in; otherwise a far first day
  would hide a working account from billing.
- **Status choices:** unchanged. A first day is not a status, so Change status
  neither lists nor replaces it, and a planned change keeps its own card.
- **Copy:**
  - People list and mobile People row, while it is ahead: muted "Starts
    Nov 10" (it comes before any planned change's text);
  - status card: a dashed second card, eyebrow "First day", "Starts Mon,
    Nov 10", detail "Can't be scheduled before then.";
  - name mark: "Starts Nov 10" when nothing else is planned;
  - record and Gridmaster card: a "First day" field ("Nov 10, 2026"),
    kept after it passes;
  - grid: a neutral bar per week labeled "Starts Nov 10", locked with "Starts
    Mon, Nov 10. Change their first day on their record to change these days.";
  - Auto-build's Not suggested: "starts Nov 10";
  - form field: **First day**, placeholder "Not set", hint "They can't be
    scheduled before this day."
- **Audit:** the person's created row carries `firstDay`; an edit lists
  `firstDay` in `changedFields` with from and to.
- **Out of reach on purpose:** bulk import and the Gridmaster organization
  setup wizard keep adding people without a first day.

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`: `firstDay` on
      `Employee` and the schedulable and status states; `isBeforeFirstDay`,
      `isSchedulableOn` refusing those days, `upcomingFirstDay`,
      `describeFirstDay`, `isValidFirstDay`, `FIRST_DAY_INVALID_*`,
      `formatFirstDay`; the status card's `starts` card and the name mark with
      a `today`. `@dubgrid/schedule-core`: a `notStarted` availability and its
      Not suggested text. _Done when:_ domain and schedule-core tests cover
      each.
- [x] **Step 2 - Migration 106.** `first_day`, `employee_schedulable_on`
      refusing days before it, and a trigger clearing the draft from today up
      to a later first day. _Done when:_ `db:migrations:check` passes and a
      live test shows days before the first day refuse a shift while it and
      later take one, moving it later clears and closes only the days between,
      moving it earlier clears nothing, and a planned away still locks its days.
- [x] **Step 3 - Server.** Types, mappers, column lists and mobile contracts
      carry `firstDay`; the web manage route accepts it on insert and update
      (validated, audited); the mobile person update accepts it; the server's
      recurring fill reads it. _Done when:_ route tests on both paths.
- [x] **Step 4 - Grid and planners.** The away range carries a first day: the
      grid locks and bars the days before it, coverage skips them and Not
      suggested names it. _Done when:_ grid helper and suggestion tests.
- [x] **Step 5 - Web.** Add Staff Members and the person form take a First
      day; the status card, People list, name mark, record and Gridmaster card
      show it. _Done when:_ component tests and screenshots.
- [x] **Step 6 - Mobile.** Add person's First day row, the status card,
      record field, name mark and People row text. _Done when:_ screen tests.
- [x] **Step 7 - Docs.** Roster guide: a first day. _Done when:_
      `npm run docs:check` passes.

## Out of scope

- Bulk import and the Gridmaster setup wizard (no First day column).
- Editing a first day on mobile (see Decisions).
- A welcome or reminder message before the first day.
- Restoring shifts a later first day took off.

## Testing

- Live integration test for 106 (BEGIN/ROLLBACK); 103 to 105's still pass.
- Domain, schedule-core, route, grid, component and screen tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- `employee_schedulable_on` is restated from 104 (105 left it alone); keep
  the planned-change branch exactly as it is.
- The draft clearing reuses `clear_schedule_for_planned_away`, which also
  closes requests; don't call it with an empty range.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint` (the two old
  `<img>` warnings, none new), `npm run test:mobile` (mobile 1,556 and every
  package), `npm run test:web` (6,712 of 6,713 on the first run; the one
  failure pinned the mobile status route's person without `firstDay`, fixed
  and re-run), `npm run docs:check`, `npm run docs:links`,
  `npm run db:migrations:check`.
- Migration 106 integration test (6) on the local stack beside 099 to 105's
  (55 in all); 106 applied to the local database only.
- Browser, Calm Haven as the QA Super Admin (worktree dev server, a throwaway
  person with a first day of Wed, Nov 4, deleted afterwards): the People list
  "Starts Nov 4" with the calendar mark, the dashed First day card "Starts
  Wed, Nov 4 / Can't be scheduled before then.", First day in the person form
  and the Record card, the Add Staff Members field and calendar, and the grid's
  "Starts Nov 4" bar from today, locked with "Starts Wed, Nov 4. Change their
  first day on their record to change these days." Moving it to Nov 6 through
  the form saved it and wrote an `employee.updated` row with `firstDay` from
  and to.
- Not taken: a mobile simulator screenshot (screen tests cover the card, the
  row text, the record and Add person's field).
