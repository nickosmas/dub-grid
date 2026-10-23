# Feature: Day off absence

**From build-plan:** feature 49d (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49d-day-off-absence` (cut from `dev` at 3580a4f4)

## Goal

The Schedule Builder knows which absence means a regular day off, and a build
writes it into the remaining empty days of everyone it schedules.

## Decisions (owner, 2026-10-23)

- **A setting, pre-detected:** Settings > Schedule Rules has "Day off
  absence". Until a choice is saved it is detected by exact name (Off, Day
  off, Days off, Off day, Rest, Rest day, Regular day off, Scheduled off) or
  code (X, OFF, RDO, DO, RO), never by a name that only contains "off" such
  as Paid Time Off; the form says it was picked from the name and asks to
  save it. **None** turns it off. Stored as `dayOffAbsenceTypeId` in
  `coverage_rule_config` (null for none, absent until saved); no migration.
  The route accepts only an active absence type of the same organization.
- **Days off written:** after shifts are planned, everyone in the build's
  scope who works at least one day in the period (with the build written)
  gets the day off absence on each empty day from today on. Cells that hold
  anything, or that the build writes, are left alone. They are part of the
  same Apply, Undo and report. Copy says "day off", never "off day".
- **Pairs:** the days that end up off come from 49c's choices, which keep
  days off together where anyone can; writing every remaining empty day
  needs no pairing of its own.

## Build steps

- [x] **Step 1 - Setting** - type, normalizer, `resolveDayOffAbsenceType`,
      route validation and merge, change-log wording, Schedule Rules field.
- [x] **Step 2 - Build** - `planDaysOff`, the preview's `daysOff`, the
      headline and breakdown ("56 new shifts · 42 days off"), days off per
      person in the report, and a hint when none is set.
- [x] **Step 3 - Docs** - Schedule Rules and Auto-build guides.

## Outcome (2026-10-23)

- **Evidence:** schedule-core 276 tests (normalizer keeps a choice, none and
  unset; detection by name and code, never Paid Time Off; archived choices
  ignored); web 3,201 across `src/__tests__`, schedule, coverage-check,
  settings, lib and the organization routes (route: own type saved with the
  org and archived filters, foreign or archived refused, none without a
  lookup, a save leaving it out keeps it; form: detected and Save enabled;
  `planDaysOff`; panel: counts, per-person days off, the none hint);
  type-check and lint clean; `docs:check:closed` 34 verified. Browser,
  Calm Haven: Schedule Rules showed "Off (X)" with the save-to-confirm note;
  Nov 1 to 14 with a temporary requirement (removed) generated "98 changes
  for 7 people · 56 new shifts · 42 days off"; applied, each of the 7 had
  all 14 days filled with shifts or Off (absence 133); their days off formed
  17 runs of two or more and 7 single days. Undo restored the 16 draft
  snapshots; the organization's settings were not changed.
- **Limit:** pairing is chosen shift by shift, so with few people covering
  many spots some single days off remain that a look-ahead plan might pair.
