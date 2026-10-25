# Shift editor edge cases: Remove, stale cells, series times, overnight doubles

**Type:** Fix
**Status:** verified

## The problem

An edge-case sweep of the shift panel and picker found four bugs (absences beside a shift were left to their own session):

- **A. A pick after Remove saved by itself.** On a cell that opened empty, picking a shift, removing it and picking again saved the draft and closed the panel without Save changes, skipping the conflict check. Remove armed a save that only cleared once the panel saw an edit, and a Remove that leaves the cell as it opened is no edit.
- **B. Cells flagged as changed by another editor.** After a drag, paste, staffing or a Builder fix, opening the cell and letting the page refresh (a peer's publish, or coming back to the tab) showed "This shift changed in another tab or by another editor" and disabled Save. The page compared the cell's label, segment detail and version, which differ between a cell built in the browser and the same cell loaded from the server ("D · M" and "DM"; a dragged new cell has no version until the next fetch).
- **C. A ranged series edit wiped other days' times.** Edit with This and later, This and earlier or All wrote every day in the range with empty custom times (080), though times change one day at a time.
- **D. Overnight shifts in a double were read wrong.** The picker, the panel and the database folded an overnight shift's morning onto the day it starts, so Early 5 AM - 1 PM beside Night 11 PM - 7 AM was refused as an overlap, while the next-day and previous-day warnings checked only the first shift of a double.

## The fix

- **A:** Remove arms the save only when the cell opened with something in it.
- **B:** the edit-session fingerprint compares what a cell holds (its snapshots, shifts, jobs, positions, Mentored, absences and times), never its labels, segment detail or version. Saves still send the latest version as the lock.
- **C:** migration 094 restates `update_series_all_shifts`: each day keeps its own times while its shifts stay the same, and a day whose shift the edit changes takes the new shift's standard times. The recurring shifts page says so.
- **D:** one same-day rule reads each shift by its real times, running past midnight: `sameDayRangesOverlap` for the picker's Can't be added list and the panel's overlap warning, and 094's `assert_non_overlapping_work_assignment_times`, matching the TypeScript save check. The next-day and previous-day warnings check every shift of both cells.

## Verify

- Unit: `ShiftEditPanel.test.tsx` (A), `editor-session.test.ts` (B), `schedule-logic.test.ts` and `shift-picker-groups.test.ts` (D); each new test fails on the old code.
- Live database: `shift-editor-edges.integration.test.ts` keeps a day's times under a ranged edit, gives a changed shift its standard times, and lets Early beside Night pass under conflict prevention while a real overlap is refused. The two bug cases fail against the old function bodies.
- Browser (local stack, Calm Haven, Thomas Crawford's Nov 2 and 3): after Remove and a fresh pick the panel waits for Save changes and nothing is saved; a shift dragged to a new day shows no stale warning after a refresh, while a real change from a second tab still does. Both cells were cleared afterwards.
