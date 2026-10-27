# Feature: An absence while away

**From build-plan:** feature 51f (item 51, Staff statuses)
**Status:** verified

## Goal

When a manager marks someone away with a return date, they can pick an
absence type in the same confirmation, such as Vacation. Every day from today
up to the return date then holds that absence in the draft, replacing any
shift there, and publishes with the period like any other change. Those days
stay locked in the grid with an explanation, and changing the return date or
the absence, or marking them active early, rewrites them.

## Design reference

The "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo), Confirmations and
Schedule grid boards. Confirmation copy follows the owner's dialog rules
(title names the thing, message only when it adds, an unlabelled box of two
or more full sentences, no person names outside the title).

## Decisions

- The absence is optional and needs a return date (`away_absence_type_id`,
  CHECK it is NULL unless `away_until` is set). Without one, 51e's behavior
  is unchanged: the away days are empty and locked.
- The range is the organization's today up to the day before the return
  date. Days before today are never touched.
- Filling writes a whole-day absence draft on every day in the range, over a
  published shift or absence, creating the cell where there is none. A day
  whose published state is already that absence and has no draft is left
  alone.
- The database fills and unfills, from the employee trigger, so web, mobile
  and every later status path get the same result. The trigger knows the
  old range and absence from `OLD`, so no marker column is needed: unfilling
  a day drops its away draft (the published state shows again), deletes an
  unpublished cell, and writes a deleted draft where the published state is
  the away absence itself.
- Rewrites happen when the return date moves (days leaving the range unfill,
  new days fill), the absence changes (the range refills), the absence is
  cleared (the range unfills, leaving the days empty as in 51e), or the
  person is marked active early (days from today unfill). Archiving clears
  as it always has.
- The 067/099 write gate accepts, on an away day, only a whole-day absence
  of their away absence type (or a deletion), so nothing else can be
  scheduled there.
- The grid's away bar uses the absence's name ("Vacation"), still one bar per
  week, and stays locked; selecting a locked day explains it: "Away until
  Fri, Oct 30. Change the return date to change these days."

## Build steps

- [x] **Step 1 - Migration 100.** `employees.away_absence_type_id BIGINT`
      (FK `absence_types`, same organization), CHECK it needs `away_until`;
      `clear_away_until_off_away` clears it too; the gate accepts the away
      absence on away days; `fill_away_absence` / `unfill_away_absence`
      (SECURITY DEFINER, not granted to browser roles) called from the
      departure trigger for every rewrite listed above; checksum locked.
      _Done when:_ `db:migrations:check` passes and a live integration test
      covers mark away with an absence over published shifts, empty days and
      unpublished drafts; moving the date earlier and later; changing and
      clearing the absence; mark active early; archive; and the gate
      refusing a shift on an away day.
- [x] **Step 2 - Server and types.** `awayAbsenceTypeId` on `Employee`,
      `DbEmployee`, mappers, `EMPLOYEE_COLS`, the mobile contracts and
      mappers. The web status route and the mobile status path accept an
      optional `absenceTypeId` with Mark away and `setReturnDate` (an active
      absence type of the organization, and only with a return date; 400
      otherwise), audited. _Done when:_ route tests cover each case.
- [x] **Step 3 - Dialog copy and fields.** `describeStatusAction` names the
      absence ("Every day until Oct 30 shows Vacation in the draft.").
      Web Mark away and Change return date dialogs gain an Absence
      `CustomSelect` (None first) under the return date, shown once a date
      is set; mobile's status sheet gains an absence list. _Done when:_
      component tests on both platforms; screenshots.
- [x] **Step 4 - Grid.** The away bar is labeled with the away absence's name
      and a locked day explains itself on select (tooltip and an
      announcement). _Done when:_ ScheduleGrid tests and a screenshot.

## Out of scope

- Suspended, last day, bulk (51c, 51d, 51g, 51h).
- An absence for someone Away with no return date.

## Testing

- Live integration tests for migration 100 (BEGIN/ROLLBACK, unique fixture
  dates, lock first).
- Route, copy and component tests; screenshots.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`, `npm run db:migrations:check`, and
  `npm run db:migrations:rehearse -- --from 099`.

## Notes for the AI

- Copy every function body verbatim from 099 and change only what 51f needs.
- Lock cells in id order, as 099's clearing does.
- No person names in dialog messages or points; titles may name them.
- A cell the fill creates has no focus area, like a whole-day absence the
  web editor saves.
- The fill runs after 099's clearing, and the clearing (copied into 100)
  leaves a day already holding the away absence alone, so moving the date
  never erases earlier away days in an unpublished draft.
- The fill and unfill must be idempotent: running the trigger twice with the
  same range and absence leaves the same draft.
- An Undo of Mark away is Mark active, which unfills; check it returns the
  draft to what it was before when nothing else changed.
