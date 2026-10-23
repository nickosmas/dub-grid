# Feature: Overtime threshold

**From build-plan:** feature 48d (parent 48, Schedule Builder)
**Status:** verified
**Branch:** `feature/48d-overtime-threshold` (cut from `dev` at aaa7feaf)

## Goal

The Schedule Builder prefers people who stay within 40 hours a week (Sunday
to Saturday), schedules someone past that only when nobody else can fill a
gap, and names each person it takes over and their hours for that week
before anything is written.

## Decisions

- **Fixed at 40 hours a week, no setting** (owner, 2026-10-22). The app
  targets the US, where the federal and every state weekly line is 40. An
  organization setting was built first and removed before it shipped.
  `WEEKLY_OVERTIME_HOURS` in schedule-core holds the number; the dashboards,
  reports and person overview keep their existing 40.
- **A week is Sunday to Saturday**, the schedule's own week. Hours are
  worked shift hours from the shared `computeShiftSegmentHours`, counted on
  the draft with the build's planned days in place; absences carry no hours.
- **Avoid if possible** (owner, 2026-10-21): at each step the planner takes
  the first fix that keeps everyone it changes at or under 40; only when no
  such fix is left does it take one that goes over. A fix counts as going
  over only when it adds hours to a week that ends past 40. Recurring
  schedule fills are the person's own pattern and are not marked. Apply all
  for a day uses the same preference.
- **A clean Build section** (owner, 2026-10-22: clean, concise, easy for
  managers to read). The six-bullet list became one sentence; the preview is
  a headline ("16 changes for 3 people"), a breakdown only when there is more
  than one kind, "Short shifts 9 → 7" and "Staff short 27 → 11" (read aloud
  as "9 now, 7 after"), the Over 40 hours a week list only when someone goes
  over, and the people left out collapsed behind "N people couldn't be
  scheduled".

## Build steps

- [x] **Step 1 - Engine** - `PlanCoverageFixesOptions.overtime`
      `{ thresholdHours, weekHours(employeeId, dateKey, planned) }`; the
      preview's `overThreshold` lists each fix taken over the threshold
      (`employeeId`, `dateKey`, `suggestionId`, and the week's hours once the
      whole plan is written).
      _Done when:_ tests show someone under the threshold is chosen first,
      a fix over it is still taken when it is the only one (and listed), and
      a fix that adds no hours to a week already over is not marked.
- [x] **Step 2 - Week hours** - `weekHoursWithPlanned` in the web adapter;
      a planned day takes its shifts' usual times unless it leaves the day's
      shifts unchanged.
      _Done when:_ tests cover the Sunday-to-Saturday week, custom times,
      absences and planned days replacing saved ones.
- [x] **Step 3 - Build section** - the page passes 40 and the week hours to
      the planner; the section shows the lean layout above.
      _Done when:_ panel tests cover the headline, breakdown, before/after
      pairs, the over-40 list and the collapsed list; the browser shows them.
- [x] **Step 4 - Docs** - the Schedule Builder guide describes the 40-hour
      preference and the new preview.
      _Done when:_ `docs:check` passes.

## Outcome (2026-10-22)

- **Evidence:** schedule-core 255 tests (overtime planner tests and the speed
  check); web 901 tests across the panel, schedule and components
  (CoveragePanel 46, adapter week hours); type-check and lint clean;
  `docs:check:closed` 34 verified. Browser, Calm Haven with a temporary
  coverage requirement (removed afterwards): the idle section shows one
  sentence, and the preview read "16 changes for 3 people", "9 → 7",
  "27 → 11", five over-40 lines and "7 people couldn't be scheduled", which
  expands to the reasons. Over-40 hours include same-day Day plus Evening
  doubles, which the builder allows because there is no rest rule (owner,
  2026-10-21).

## Follow-ups

- Daily overtime (California, Alaska, Nevada, Colorado) and the hospital and
  residential care "8 and 80" rule (FLSA 7(j)) are not modelled, nor is a
  workweek that starts on another day.
- The expanded "couldn't be scheduled" list repeats each date's reason; it
  could group dates by reason.
