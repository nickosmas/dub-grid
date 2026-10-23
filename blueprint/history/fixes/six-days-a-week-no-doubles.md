# Fix: Six days a week, not only six in a row; no automatic double shifts

**Type:** Fix
**Status:** verified
**Branch:** `fix/six-days-a-week` (cut from `dev` at caeaf244)

## Problem

49f added "Allow a sixth day in a row", but the owner meant six days in a
week. Auto-build had no weekly cap at all: with five in a row as the only
limit, someone could work Sunday to Thursday, rest Friday and work Saturday,
six days in one week.

## Decisions (owner, 2026-10-23)

- **Always:** at most 5 days in a Sunday-to-Saturday week and at most 5 in a
  row, for builds, suggestions and recurring fills. A second shift on a day
  already worked adds nothing.
- **"Allow 6 days in a week"** (renamed from "Allow a sixth day in a row"):
  both limits move to 6, never 7 of either. The warning says so, and the
  result names each person given a sixth day in a week (by week) and each
  run of six (by dates).
- **No double shifts from Auto-build** (owner, 2026-10-23: "NEVER do double
  shifts. that should only be done manually by schedulers"): a build and a
  day's Apply all never give anyone a second shift on a day they already
  work, saved or planned. The suggestions list, where a scheduler picks one
  at a time, may still offer it.
- **Period** (owner, 2026-10-23): the build report and the Applied list
  belong to the period they were made in and show only there.

## Steps

- [x] **Step 1 - Rules** - `MAX_DAYS_IN_A_WEEK` (5) and a stretched value of
      6; a `workWeek` availability reason ("would work 6 days that week");
      the weekly check in `availabilityFromShifts`, `availabilityWithPlanned`
      and `limitRecurringRuns`; `daysPastUsualLimit` reports weeks too.
      _Done when:_ adapter tests cover a sixth day in a week refused, allowed
      with the option, a seventh never, a second shift on a worked day, and
      recurring fills.
- [x] **Step 1b - No doubles** - a `doubleShift` availability reason
      ("already works that day") used only when planning a build or Apply
      all.
      _Done when:_ adapter tests show a worked day refused when planning and
      allowed for a single suggestion; the browser build gives nobody two
      shifts on a day.
- [x] **Step 1d - Period** - the report and Applied entries carry their
      period.
      _Done when:_ a headless run shows them on their period only.
- [x] **Step 2 - Option and result** - the label, warning, description and
      result lists ("6 days in a week", "6 days in a row").
      _Done when:_ panel tests cover them; a headless browser run shows them.
- [x] **Step 3 - Docs** - the Auto-build guide.

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check.

## Outcome (2026-10-23)

- **Rules:** `MAX_DAYS_IN_A_WEEK` (5) and `MAX_DAYS_IN_A_WEEK_STRETCHED` (6);
  one `overWorkLimits` check (a worked day is a `doubleShift` when planning,
  otherwise free of the counts; then `workRun`, then `workWeek`) in
  `availabilityFromShifts`, `availabilityWithPlanned` and
  `limitRecurringRuns` (a left-out fill records which limit). Planning always
  passes `noDoubleShifts`; the suggestions list does not.
  `daysPastUsualLimit` returns runs and weeks.
- **Option:** "Allow 6 days in a week" moves both limits to 6; the warning
  reads "Some people may work 6 days in a week or 6 in a row, never 7"; the
  result lists "6 days in a week" (week of) and "6 days in a row" (ranges).
  The description now reads "Nobody works more than 5 days a week or 5 in a
  row ... Never moves anyone already scheduled or gives anyone two shifts in
  a day."
- **Period:** the build report and Applied entries carry their period key and
  show only on that period; returning shows them again with Undo.
- **Evidence:** schedule-core 278 tests; web 4,103 (adapter: sixth day in a
  week refused after a day off, the next week starting again, allowed with
  the option, recurring left-out by week, doubles refused when planning and
  allowed for a single suggestion, past-limit weeks; panel: the option,
  warning and both lists); type-check and lint clean; `docs:check:closed`
  34 verified. Headless Chromium, Calm Haven Nov 1 to 14 with a temporary
  requirement (removed): an applied build left 0 cells with two shifts among
  56 worked cells and no Sunday-to-Saturday week over 5 days; the report and
  the Applied line showed on Nov 1 to 14, were absent on Nov 15 to 28, came
  back on return, and Undo restored the 16 draft snapshots. A first run's
  build was discarded through the app's Discard my drafts for that period.
- **Moved out:** topping people up toward five days beyond coverage needs is
  its own change (owner: overstaffing is acceptable for it).
