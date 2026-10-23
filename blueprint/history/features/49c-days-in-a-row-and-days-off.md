# Feature: Five days in a row, days off in pairs

**From build-plan:** feature 49c (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49c-work-runs` (cut from `dev` at 9f0fae9c)

## Goal

Auto-build and the suggestions never schedule anyone a sixth day in a row,
counted across period boundaries, and a build keeps each person's days off
in pairs, splitting them only when nobody who could fill a shift would keep
them together.

## Decisions (owner, 2026-10-23)

- **Five days in a row at most**, regardless of pay periods: days before
  and after the period count (the page already loads a wide window around
  it). A second shift on a day already worked never adds to a run.
- **Recurring fills obey it too**: a recurring shift that would make a sixth
  day is left out, in date order, and named in the result and the report.
- **Days off in pairs** (owner: split if and only if pairs are impossible):
  between people who would fill a shift the same way, one who would be left
  a single day off between work days ranks last; if everyone would, the
  shift still goes out. Coverage stays first.
- Restores and moves back put back a person's own published shift and are
  not checked against the run; 49f adds the sixth-day option.

## Build steps

- [x] **Step 1 - Engine** - `MAX_DAYS_IN_A_ROW`, a `workRun` availability
      reason ("would work 6 days in a row"), `splitsDaysOff` as the first
      fairness key with a `daysOff` choice reason, and `skippedRecurring`
      echoed as the preview's `recurringSkipped`.
- [x] **Step 2 - Web** - `daysInARowWith`, the run check in
      `availabilityFromShifts` and `availabilityWithPlanned`,
      `limitRecurringRuns` before planning, and `splitsDaysOff` in the
      standing; the summary, result and report say so.
- [x] **Step 3 - Docs** - the Auto-build guide states both rules.

## Outcome (2026-10-23)

- Description now: "Fills open shifts with qualified staff who are free,
  starting from recurring schedules. Nobody works more than 5 days in a row,
  days off stay together, and everyone stays within 40 hours a week when it
  can. Weekends and nights are shared fairly. Never moves anyone already
  scheduled."
- **Evidence:** schedule-core 272 tests (days off first and its reason, a
  split only when everyone splits, the reason text, recurring left-outs
  echoed); web 281 across the adapter (runs both ways, across the period
  start, second shift allowed, planned days and a planned day off, recurring
  left-outs, split days off), panel and schedule suites; type-check and lint
  clean; `docs:check:closed` 34 verified. Browser, Calm Haven Nov 1 to 14
  with a temporary requirement (removed): 56 changes applied; the database's
  longest run touching the period was 5 (none over; Carol Henderson's ran
  Oct 29 to Nov 2), and the report named "Keeps days off together" for three
  people. Undo restored the 16 draft snapshots. Runs of 6 in late October
  are existing seeded data.
