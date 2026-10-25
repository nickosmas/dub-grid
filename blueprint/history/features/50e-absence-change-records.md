# Feature: Change records name the time an absence covers

**From build-plan:** feature 50e
**Status:** complete
**Completed:** 2026-10-25
**Type:** Feature

## Goal

Every record of a schedule change reads an absence beside a shift by the time
it covers, in time order: Before and After in the panel and the grid's hover
card, schedule-change alerts and push, the activity log, the reports'
schedule matrix, the schedule CSV and export, and the calendar feed. A change
to the absence's time alone is a change.

## Design reference

The "Absence beside a shift" canvas, Change board: "Absence ADDED Sick 11:00
AM - 3:00 PM, not worked" under After, and the push line.

## Scope

- **Shared model (`schedule-core`):** an absence item carries the time it
  covers; it reads "Sick" over "11:00 AM - 3:00 PM, not worked" (the next day
  named past midnight), sorts first when they arrived late, gets its own
  interval on the day bar, and a change to its time marks it changed.
  `cellStateToChangeDay` passes the stored times and `isSameCellState` counts
  them. `absenceSideOf` moved here from web, and `joinAbsenceBesideShifts`
  writes one line ("Day / Sick 11:00 AM - 3:00 PM", or the absence first).
- **Web:** the grid's draft hover card builds both sides with their spans; the
  schedule CSV, the server export and the calendar feed use the shared line;
  the reports' schedule matrix names the time and leads with an arrived-late
  absence; the activity log says "with an absence, 11:00 AM – 3:00 PM".
- Alerts, push, Publish History, the staff "Was" block and mobile shift
  detail all read the shared model, so they follow without their own change.

## Out of scope

- Mobile layouts (50f); requests and availability (50g).
- Older publish rows and audit rows saved before 50b keep their untimed text.

## Completion notes (2026-10-25)

- **Evidence:** schedule-core tests for the timed description, order, bar,
  next day and a times-only change; input tests for carrying the times and
  the same-cell check; the side rule and the joined line. Web tests for
  `publishedCellText` (after, first, untimed), the reports matrix for an
  arrived-late absence, and the activity log text; 675 existing change-surface
  tests still pass. Browser (local Calm Haven, QA super admin): adding Sick
  at 11:00 AM beside Richard Bennett's Day shift showed After as "Absence
  Added, Sick, 11:00 AM - 3:30 PM, not worked"; the edit was cancelled.
- **Docs:** the reports and integrations pages name the time; the grid page
  already did (50d).
