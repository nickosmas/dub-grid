# Fix: A double shift always reads in time order

**Type:** Fix
**Status:** verified
**Branch:** fix/double-shift-order

## Problem

A cell with two shifts could show the later one first, such as an Evening pill above a Day pill. Staffing an open shift ("Fill a spot") for someone already working that day added the staffed shift after the existing one, whatever its time. The edit panel already put a second shift in time order, but only when it could match both shifts to an assignment.

## Change

- `buildStaffedOpenShiftInput` puts the existing and staffed shifts in start-time order, moving each `|`-aligned custom time with its shift (the same `orderSegmentsByStartTime` the panel uses).
- The panel's second-shift ordering falls back to the shift's own start time when no assignment matches.
- Cells already saved out of order keep their order until they are next edited.

## Checks

- `open-shift-staffing.test.ts`: a 7 AM shift staffed beside a 4 PM one comes first with the custom times realigned; a later shift stays second (17 pass).
- Headless Playwright on Calm Haven (`qa-super-admin`): in an empty cell, Evening then Add another shift then Day saved as Day, Evening (positions 0 and 1 in the database). The test cell was removed afterwards.
- `npm run type-check`, eslint on the changed files.
