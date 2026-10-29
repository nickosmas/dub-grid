# Feature: Away all period

**From build-plan:** feature 54
**Status:** verified

## Goal

In the Week and 2 Weeks grid, people who are away for every day on screen
stop pushing working staff down: they sit at the end of their section under
one "Away all period · N" row that folds them away, and folded, the row names
each person and why.

## Design reference

The inline prototype the owner approved on 2026-10-28 ("approved design"):
the group row with a chevron, its count, and when folded the names with the
reason ("Diane Patterson (Away until Nov 9), Shirley Bihag (Leave every
day)").

## Decisions made (owner, 2026-10-28)

- The day off absence on its own doesn't count as away.
- The group starts open, and each viewer's browser remembers folding it.

## Decisions made here

- **Who counts:** every day shown is one of their away days (the Away,
  Offboarded or Starts bar) or a whole-day absence other than the day off
  absence; any shift or empty day leaves them in place. The reason reads
  "Away until <date>", "Away", "Offboarded", "Starts <date>", "<absence>
  every day", or "Absent every day" for several absences.
- **Everyone away, no group:** a section whose people are all away shows no
  group, since there is nobody to sit them below.
- **One rule, two callers:** `orderAwayAllPeriod` in
  `schedule-grid/awayAllPeriod.ts` orders both the grid model's sections and
  the grid's own section build, which recomputes them.
- **The fold is per section,** remembered in local storage under a `dg_`
  key (cleared with the rest at sign-out) through `useRememberedFold`.

## What was built

1. `awayAllPeriodReason` and `orderAwayAllPeriod`, with tests.
2. The model and the grid order sections with it; the page passes the
   organization's day off absence.
3. The group row in `ScheduleGrid` (a full-width row with a chevron button,
   `aria-expanded`, the count, and the names folded), the fold hook, and
   the section memo comparing the away map by content.
4. The schedule grid docs page.

## Completion evidence

- Unit: `awayAllPeriod.test.ts` (7 cases) and the grid test (order, the
  group row, folding, the names, the fold surviving a remount, no group
  without anyone away); every existing grid test passes, including the
  re-render tests and the absence fixtures where everyone is away.
- `type-check`, `lint`, `docs:verify` (12 pages re-fingerprinted, the
  inventory refreshed) and the full `test:web`.
- Not browser-checked: the browser pane was hidden, so the page ran as a
  background tab and never painted; the render test stands in for it.
