# Fix: Edit a repeating shift's dates and pattern

**Type:** Fix
**Status:** verified
**Branch:** `fix/edit-repeating-series` (cut from `dev` at caeaf244)

## Problem

Tapping a repeating shift or absence offered only an edit scope and Remove.
Its frequency, days, start and end could not be changed after it was made.

## Decisions (owner, 2026-10-23)

- **Days already in the series:** offer both choices. "Keep their changes"
  leaves a day changed on its own as it is; "Reset to match" puts every day
  back to the repeating shift.
- **Migration 090:** the new pattern is applied in one database function, so
  a failed save leaves the series as it was.

## Steps

- [x] **Step 1 - Database** - `reschedule_shift_series` (migration 090)
      removes the dates leaving the pattern as `delete_shift_series` does,
      writes the dates joining it as `create_shift_series` does (keeping a
      day's existing shift when asked), resets kept dates only when asked,
      updates the series row, and returns the removed days.
      _Done when:_ live tests cover fewer dates, reset, joining with keep and
      replace, a published date leaving, and a pattern with no dates.
- [x] **Step 2 - Route and client** - `getShiftSeries` reads the pattern and
      the dates it holds; `rescheduleShiftSeries` applies a new one and clears
      notes on removed days.
      _Done when:_ route tests cover the call, the permission gate, the date
      limit and the read.
- [x] **Step 3 - Panel** - "Edit dates and pattern" opens the repeat form
      filled in, with the added and removed counts and the keep or reset
      choice; disabled while the day has unsaved changes.
      _Done when:_ a browser run changes a Mon/Wed series to Mon/Fri ending
      Nov 6 and the grid and database agree.
- [x] **Step 4 - Docs** - the Recurring shifts guide.

## Verification

- `shift-series-scope.integration.test.ts` (12), `route.test.ts` (55),
  `authorization-sql-boundaries.test.ts`, type-check, lint and `docs:check`.
- Browser, local stack: a 10-day Mon/Wed absence became Mon/Fri, Oct 26 to
  Nov 6; the preview read "2 added, 8 removed" and the series held
  10-26, 10-30, 11-02, 11-06. The test series was removed afterwards.
- `npm run db:migrations:rehearse -- --from 089` applied 090 and qualified.

## Known limit

A day removed on its own before it was ever published leaves no record, so a
pattern that includes that date again brings it back.
