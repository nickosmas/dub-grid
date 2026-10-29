# Feature: One staff page - Shifts

**From build-plan:** feature 55d
**Status:** verified

## Goal

A Shifts tab on the staff page lists every shift the person had in the chosen
period, newest first, spelled out, with its state, and exports the rows shown
as CSV.

## Design reference

The inline full-page prototype approved on 2026-10-29: a `dg-card` with the
period's count and hours, a state filter and Export CSV (text-only buttons),
and a People-table-styled list of Date, Shift, Hours and State.

## In scope

- One row per day with a shift in the period (`lib/shift-records.ts`): the
  shift and job spelled out with times (a custom time on the first shift),
  the focus area, hours, and state: Published, Draft (new, changed or
  removed, with what a change replaces) or Corrected (with its reason).
  An absence beside the shifts and the day's schedule notes are named.
- Corrections load only for someone who can edit shifts, and notes only for
  someone who can view the schedule, matching their routes.
- Export CSV of the rows shown, named for the person and the period, through a
  shared `downloadCsvFile` that the schedule export now uses too.
- The period control on the Shifts tab.

## Out of scope

- Absence-only days (55e, Time off) and requests (55f).

## Build steps

- [x] **Step 1 - Shift records** - `buildShiftRecords` and
      `shiftRecordsToCsv`, tested for order, spelling, a changed and a removed
      draft, a corrected day with an absence and notes, and the CSV.
- [x] **Step 2 - The tab** - `ShiftsTab` with the filter, total and export,
      and the page's corrections and notes queries; tested for the rows, the
      export and the empty state, and that corrections load only for an
      editor (which caught an `enabled: undefined` that would have loaded
      them for everyone).
- [x] **Step 3 - Docs and qualification** - the Shifts bullet in
      `docs/staff/detail-page.mdx`, fingerprints re-recorded, and a browser
      check of the tab over the last 12 weeks.
