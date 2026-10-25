# Feature: The app shows the time an absence covers

**From build-plan:** feature 50f
**Status:** complete
**Completed:** 2026-10-25
**Type:** Feature

## Goal

The mobile app reads an absence beside a shift the way the web does: the time
it covers, after the shift or before it when the person arrived late.

## Scope

- **Server:** each entry's `restOfDayAbsence` gains `startTime`, `endTime`
  (`HH:MM`, null when untimed) and `arrivedLate`, worked out with the shared
  side rule from the cell's work span. All three are optional in the
  contract, so an older app build ignores them.
- **App:** Your Week puts an arrived-late absence's row before the shifts and
  shows its time instead of "Rest of the day"; the Home card shows the time on
  the absence's pill, puts it first when they arrived late, and says the time
  aloud; shift detail reads "Absence: Sick, 11:00 AM - 3:00 PM, not worked".
  The team list and the hero keep the absence's chip beside the shift.
- Before and After in shift detail ("What changed") already reads the shared
  change model, which names the time since 50e.

## Completion notes (2026-10-25)

- **Evidence:** a server test for the span and side (left early and arrived
  late) and the untimed shape; app tests for the chip helpers, the Home card
  (arrived late first, its time, its spoken label) and Your Week (arrived-late
  row before the shift, with its time). 111 existing app tests around these
  screens still pass. Not run on a simulator: Metro can't start from a
  worktree, and the screens change only text and order.
