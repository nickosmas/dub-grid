# Turning Mentored on and back off leaves nothing to save

**Type:** Fix
**Status:** verified

## The problem

- In the shift panel, turning Mentored on and then off again kept Cancel and Save changes in the footer, as if the shift had changed.
- The panel decided it had edits by comparing the cell's label as well as what it holds. A cell loaded from the schedule is labelled "D · M", and the same cell rebuilt by any edit is labelled "DM", so after a round trip the labels still differed although the shift, job, position and Mentored were all back.
- Cancel had the opposite gap: it put the shifts back only when the label or the absence had changed. On a cell whose label stays the same with Mentored on (one already edited in this draft), Cancel left Mentored on.

## The fix

- The panel compares what the cell holds (shifts, jobs, positions, Mentored, the absences, times and notes), never its label.
- Cancel puts the shifts back whenever any of them differ.
- The confirm-save test harness now passes the cell's shifts to the panel, as the schedule page always does.

## Verify

- `ShiftEditPanel.test.tsx`: after Mentored goes on and off with the label changing from "D · M" to "DM", Save changes is gone; Cancel turns Mentored back off when the label did not change. Both fail on the old panel. All 104 panel tests pass.
- Browser (local stack, Calm Haven): on Thomas Crawford's Mon 26 (D · M), Save changes appeared with Mentored on and disappeared with it off again. Before the fix it stayed enabled. Nothing was saved.
