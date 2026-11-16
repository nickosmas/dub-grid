# Fix: Month view: a useful overview of the month

**Type:** Fix

**Status:** complete

### The problem

The Schedule page's Month view (`apps/web/src/components/MonthView.tsx`) shows
only a focus-area name and a headcount per day. It computes shift-category
counts and never shows them. It says nothing about open shifts, staffing
shortages, unpublished changes, waiting requests, who is off, or which days are
past. Its cells are 64px tall, so the calendar uses about a third of the
screen. A day opens a 300px popover with short names and no shift times, and
there is no way from a day to the week where it can be edited. It also drops a
person whose published absence the draft turned into a shift, because it
tests the published absence as well as the draft one. Every style is inline.

### The fix

Built from the approved "Month view refinement" canvas (2026-11-15).

- Day cells fill the page's height. Each lists its focus areas, or with one
  area chosen, that area's shifts, with a chip per shift (`D 4`) in the
  shift's color.
- A staffing target that day is short: the chip gets a red ring (the
  Schedule Builder's shortage color; the canvas drew it orange) and the
  day says "2 short". Shortages come from the shared coverage engine
  (`computeCoverageCategorySnapshots`), over the draft for editors and the
  published days for everyone else, only for people who can see the Schedule
  Builder's coverage, and only from today on.
- An amber "1 open" chip for call-off open shifts this viewer may see (the
  page's existing `openShifts`), a dashed ring for unpublished changes, and
  the request corner fold (amber on a manager, slate on a teammate).
- Past days take the grid's light wash; today is outlined; "2 off" counts
  whole-day absences.
- A day opens a side panel (inline under the calendar at phone width): the
  date, "14 working · 1 off · 1 open shift · 1 short", Open this week, then
  each area's shifts with their times and coverage, everyone with draft,
  request and note marks, the open shifts and who is off and why.
- Arrow keys move between days; Escape closes the panel.
- Day data moves into a pure, tested module; styles move to `dg-month-*`
  classes on the existing tokens.

Must not break: search highlighting, note dots (F-82, F-106 rules), the
focus-area filter, terminology from org settings, Month's publish window.

### Build steps

- [x] 1. **Month model** - `components/schedule-month/monthModel.ts` builds
      the weeks and each day's areas, shift groups, coverage, open shifts,
      absences, drafts and request folds. Done when its unit tests pass.
- [x] 2. **View** - `MonthView` renders cells and the day panel from the model
      with `dg-month-*` styles, at desktop and phone width. The page passes
      coverage snapshots, open shifts, request summaries, the absence lookup
      and Open this week. Done when the browser shows the canvas's layout with
      real Calm Haven data, and type-check, lint and tests pass.

### Verify

Schedule > Month on Calm Haven at 1440px and 390px: counts per shift match the
2 Weeks grid, the panel lists the same people, Open this week lands on that
week, past days are washed, a staffing target in Settings shows a shortage.

### Outcome

- Whole-day absences show their name; the day off absence (Schedule Rules)
  is listed under Day off and left out of the cell's "absent" count.
- Shift chips show headcount; a shortage is stated per requirement row in
  the panel ("1 short of 5"), exact to two places with mentored credit.
- Checked on local Calm Haven at 1440px (counts match the 2 Weeks grid,
  Open this week lands on 1 Week Nov 22 to 28, arrow keys and Escape work,
  the calendar fills the window without page scroll) and at 390px, with two
  temporary staffing targets that were removed afterwards.
