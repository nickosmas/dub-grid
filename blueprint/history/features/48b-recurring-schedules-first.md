# Feature: Schedule Builder - recurring schedules first

**From build-plan:** feature 48b (parent 48, Schedule Builder)
**Status:** complete
**Branch:** `feature/48b-recurring-first` (cut from `dev` at dfc2ef6d)

## Goal

A build starts from each person's recurring schedule. Before it fills any
gap, it fills every empty cell in its scope that a recurring schedule covers
(the same cells **Fill from Recurring Schedules** fills), and the preview says
how many shifts and absences that adds. Only then does it put back the
draft's own changes and schedule free, qualified people, planned on top of
those recurring fills, so nobody is booked twice and no recurring absence is
overridden. Everything, recurring fills included, is one draft change with
one Undo.

## Decisions (made for the owner)

- **One rule for recurring fills.** The builder and Fill from Recurring
  Schedules use one tested function for which cell gets which recurring
  schedule: only empty cells; the weekday matches; the date is within the
  schedule's effective dates, the latest start winning; a worked schedule
  whose shift or job is archived, or an absence schedule whose absence type
  is archived, fills nothing. This is the rule the server's fill already
  applies and the Fill preview already copies.
- **The builder writes recurring fills itself**, through the same draft save
  as its other changes (marked as from a recurring schedule, as the server's
  fill marks them), so they share the preview, the scope and the one Undo.
  Fill from Recurring Schedules keeps using the server's fill.
- **Scope.** With a focus area filter, only people in the focus areas shown
  get recurring fills; without one, everyone does. The period is the one on
  screen.
- **Recurring absences block.** A recurring absence fills its cell and makes
  that person unavailable that day to every later step.

## Build steps

- [x] **Step 1 - One recurring fill rule** - `planRecurringFills` in
      `apps/web/src/app/(app)/schedule/_lib/recurring-fills.ts` returns
      `{ employeeId, dateKey, input }[]` for the empty cells a recurring
      schedule covers; Fill from Recurring Schedules counts with it.
      _Done when:_ tests cover an empty cell filled, a cell with an entry
      skipped, the weekday, the effective dates (start, end, open end), the
      latest start winning, archived shift, job and absence type skipped, an
      absence schedule, and the employee filter; the Fill preview's count is
      unchanged.
- [x] **Step 2 - The engine plans on top of fixed days** - `planCoverageFixes`
      and `previewCoverageBuild` take `baseOverrides`: draft days applied
      before any fix, counted in "after", seen by availability, and never
      written twice. `CoverageBuildPreview` gains
      `recurring: { shifts: number; absences: number }`.
      _Done when:_ tests cover a recurring fill closing a gap so nothing else
      is planned for it, a person with a recurring shift not booked again
      that day, a recurring absence blocking that person, the counts, and an
      empty base giving 48a's preview.
- [x] **Step 3 - The page builds from recurring schedules** - Preview build
      fetches the recurring schedules, plans the fills for the scope,
      converts each with the same snapshot a save would produce, and passes
      them as `baseOverrides`; Build writes the recurring fills, then the
      fixes, as one Applied entry, and plans again before writing.
      _Done when:_ type-check passes and the browser check shows it.
- [x] **Step 4 - The Build section says so** - the list of what a build does
      starts with recurring schedules, and the preview shows "From recurring
      schedules: N shifts, M absences" when there are any.
      _Done when:_ component tests cover the line with shifts only,
      absences only, both, and none (no line).
- [x] **Step 5 - Guides and leftover wording** - the Schedule Builder and
      recurring schedule guides describe it; the Fill progress detail stops
      saying "recurring templates".
      _Done when:_ `docs:check` passes with fingerprints re-recorded and no
      "recurring template" remains in `apps/web/src`.
- [x] **Step 6 - Browser check** - Calm Haven as `qa-super-admin`, with
      temporary requirements and a temporary recurring schedule on an empty
      day (both removed afterwards): the preview counts the recurring fill,
      Build writes it marked as recurring with the other fixes, the matrix
      matches the preview, and Undo restores the published schedule.

## Data / contracts

- **Load-bearing:** `CoverageBuildPreview.recurring`; `baseOverrides` on
  `PlanCoverageFixesOptions`; `planRecurringFills` and its
  `RecurringFill { employeeId; dateKey; input: ScheduleCellInput }`.
- No schema, API or migration change.

## Out of scope

- Named skipped people in the preview (48c), overtime (48d), fairness (48e),
  the report (48f).
- Changing the server's recurring fill or the recurring schedule editor.

## Critique applied before building

- A fill whose snapshot can't be resolved (a definition missing from the
  page) is skipped and counted nowhere, so the preview never claims a fill
  Build can't write.
- Recurring fills are planned per scope, so a focus area filter never fills
  another area's people.
- Build re-plans the recurring fills too, so a recurring schedule edited
  after the preview is caught by the same compare-and-show-again rule.

## Notes for the AI

- The engine never learns about recurring schedules; it only sees fixed
  draft days. Coverage math stays in `computeCoverageCategorySnapshots`.
- No em dashes; "absence", not "off day".

## Result

- One tested rule, `planRecurringFills`, decides which empty cells recurring
  schedules fill; Fill from Recurring Schedules' preview and the Schedule
  Builder both use it.
- A build fetches the recurring schedules, fills the empty cells they cover in
  its scope first (marked as from a recurring schedule), and plans the fixes on
  top; the preview reads "From recurring schedules: N shifts, M absences", and
  the whole build is one Applied entry with one Undo.
- Browser, Calm Haven with a temporary requirement and a temporary recurring
  Friday Day Shift for one person (both removed): the preview counted 1
  recurring shift and 15 schedules (one fewer than without it), Build wrote the
  Friday cell with `from_recurring = true`, the matrix matched the preview, and
  Undo removed every built cell.
- "Recurring template" no longer appears to people: Settings' delete messages,
  the onboarding orientation and the Fill progress text say recurring
  schedules.
