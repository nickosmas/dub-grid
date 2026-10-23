# Feature: Allow a sixth day

**From build-plan:** feature 49f (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49f-sixth-day` (cut from `dev` at e2a6e2d9)

## Goal

When five days in a row cannot fill the schedule, a scheduler can choose,
before generating, to let Auto-build give someone a sixth day in a row, never
a seventh, with a warning and every such run named in the result.

## Decisions (owner, 2026-10-23)

- **An option before building, not a second pass after it** (the owner
  replaced the earlier "fill the rest with overtime" idea). "Allow a sixth
  day in a row" sits under the description, off by default; once on, a
  warning reads "Some people may work 6 days in a row, never 7. The result
  names everyone who does." Changing it clears a generated result.
- **Overtime is unchanged:** avoided, used only when nobody else can fill a
  shift, and named (the owner's latest message asked only about the sixth
  day).
- With the option on, the limit is 6 for the build's planning, its
  recurring fills and its first pass; the result and report list each
  person and run under "6 days in a row" ("William Harper Sun, Oct 25 to
  Fri, Oct 30").

## Build steps

- [x] **Step 1 - Limit as a parameter** - `maxDaysInARow` on the adapter
      input, `limitRecurringRuns(fills, shifts, limit)`,
      `MAX_DAYS_IN_A_ROW_STRETCHED`, and `daysPastUsualLimit`.
- [x] **Step 2 - Option and result** - the switch and warning, the page's
      `allowSixthDay` through `planOptions` and `planBuild`, the preview's
      `sixthDays`, and `runLines` grouping each person's days into ranges.
- [x] **Step 3 - Docs** - the Auto-build guide.

## Outcome (2026-10-23)

- **Evidence:** schedule-core 278 tests; web 4,097 across `src/__tests__`,
  schedule, components and lib (a sixth day allowed but never a seventh,
  planned days past five found, the option and its warning, the runs as
  ranges); type-check and lint clean; `docs:check:closed` 34 verified.
  Browser: the in-app pane stopped hydrating at desktop width in this
  session (the Dashboard too, an environment stall), so the check ran in
  headless Chromium with Playwright at 1440 by 900, signed in as the QA
  Super Admin, Calm Haven Oct 18 to 31 with a temporary requirement
  (removed): off, 21 changes for 4 people; on, the warning above and the
  same counts with "6 days in a row: William Harper Sun, Oct 25 to Fri,
  Oct 30" (the shifts left short there are blocked by absences and
  overlaps, not the limit). Nothing was applied.
