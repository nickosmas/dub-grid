# Feature: Fairness

**From build-plan:** feature 48e (parent 48, Schedule Builder)
**Status:** verified
**Branch:** `feature/48e-fairness` (cut from `dev` at ccfffadd)

## Goal

When more than one person could fill the same short shift equally well, the
Schedule Builder picks fairly instead of alphabetically: the person with the
fewest weekend shifts for a weekend shift, the fewest night shifts for a night
shift, and otherwise the fewest hours in the period. Each choice records why,
so the build report (48f) can say it. Coverage always comes first: fairness
only chooses between people who fill the same shift the same way.

## Decisions (made for the owner, 2026-10-22)

- **Where fairness applies:** only among `assign` fixes for the same cell
  that close and fill the same amount and are on the same side of 40 hours.
  Restores and moves back put back a named person's own shift and are never
  reordered. Suggestions in a day's list keep their order.
- **Order:** for a weekend shift (Saturday or Sunday), fewest weekend shifts;
  for a night shift (starting 9 PM to before 5 AM), fewest night shifts; then
  fewest hours in the period; then name.
- **Counts:** weekends and nights over the 4 published weeks before the
  period plus this draft's period with the build's planned days written;
  hours over the period on the draft with planned days. If the history cannot
  be loaded the build still runs on the period alone.
- **Reasons:** each choice records `only`, `weekends`, `nights`, `hours` or
  `tie` with the chosen person's count, kept in the preview for 48f. The
  Build section only adds "sharing weekends, nights and hours evenly" to its
  summary sentence; per-person reasons wait for the report, so the panel
  stays lean (owner, 2026-10-22).

## Build steps

- [x] **Step 1 - Engine** - `PlanCoverageFixesOptions.fairness` with a `standing` callback
      returning `weekends`, `nights` (null when the shift is not one) and
      `hours`; the
      planner picks the best standing among equal `assign` peers and the
      preview's `choices` records each pick's reason.
      _Done when:_ tests show the fewest weekends, nights and hours each
      winning, coverage and the 40-hour rule still coming first, restores
      untouched, and the reasons.
- [x] **Step 2 - Standing** - `fairnessStandingWithPlanned` in the web
      adapter counts weekend and night shifts from history plus the draft
      period, and period hours, with planned days written.
      _Done when:_ tests cover weekend and night detection, history, the
      period and planned days.
- [x] **Step 3 - Page** - the build loads the 4 published weeks before the
      period and passes fairness to the planner (Apply all for a day uses the
      period alone); the summary sentence names it.
      _Done when:_ in the browser, a build spreads shifts across people rather
      than by name, and the panel tests pass.
- [x] **Step 4 - Docs** - the Schedule Builder guide says how it shares work.
      _Done when:_ `docs:check:closed` passes.

## Out of scope

- The build report (48f), rest rules, per-person preferences or limits.

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check.
- Never approve the seeded Calm Haven requests.

## Outcome (2026-10-22)

- **Engine:** the planner takes its first candidate as before (coverage, then
  the 40-hour rule), then picks the fairest among `assign` peers for the same
  cell, shift and effect, compared as weekends, nights, hours, then the old
  name order. `choices` records `only`, `weekends`, `nights`, `hours` or
  `tie` with the count and how many others could have taken it.
- **Web:** `fairnessStandingWithPlanned` shares the draft-day hours code with
  `weekHoursWithPlanned`; a night shift starts from 9 PM to before 5 AM. The
  build loads the 28 published days before the period with the page's own
  `fetchShifts` (a failure falls back to the period alone); Apply all for a
  day uses the period alone. The summary sentence names the sharing; the
  per-person reasons wait for the 48f report.
- **Evidence:** schedule-core 262 tests (seven fairness cases: fewest hours
  with reasons, weekends and nights first, ties by name, only one person,
  restores untouched, 40 hours first); web 264 across the panel, schedule and
  adapter (three standing tests); type-check and lint clean;
  `docs:check:closed` 34 verified. Browser, Calm Haven with a temporary
  requirement (removed): the preview runs and each one loads the history
  (`POST /api/schedule/manage` 200) with no console errors. Calm Haven had
  only three free people, so the browser could not show a different choice;
  the planner tests carry that.
