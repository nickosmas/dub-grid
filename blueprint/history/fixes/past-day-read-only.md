# Fix: a past day opens read only, with Correct this day

**Type:** Fix
**Status:** complete
**Branch:** `fix/past-day-read-only`
**Design reference:** "Past days read-only panel" canvas
(https://claude.ai/artifact/QjCQomHYvN6NRy6WrnbCZf), approved 2026-11-28.

### The problem

Clicking a day before today opens the shift panel straight in the correction
editor ("Correct this day" above the name, the shift picker, Save
correction). Someone who only wanted to see what a past day held lands in an
editor that changes the published day at once, and the panel never shows the
day as it stands.

### The fix

A past day opens the panel's existing read-only view (`ShiftPanelView`, the
view a repeating shift opens in): the shift as it stands, its Time, Job and
notes, any correction card, and the last-change line. Nothing in it edits.

- **Correct this day.** When the viewer may correct the day (Edit shifts and
  Publish schedule; Admins the last 14 days, older days a Super Admin), the
  footer is one full-width primary button, "Correct this day". It turns the
  same panel into today's correction editor, unchanged: the eyebrow, the
  picker, Before and After, the optional reason, Save correction.
- **Back and Cancel return to the view**, not the grid. Saving a correction
  closes the panel as it does now.
- **No permission.** When the viewer can edit shifts but may not correct this
  day, the view shows the existing reason ("Correcting a past day needs
  Publish schedule." or the 14-day line) and no button.
- **Nothing scheduled.** An empty past day opens the view with "Nothing
  scheduled" and still offers Correct this day, so a shift that happened but
  was never on the schedule can be recorded.
- **Last-change line.** It keeps today's rule: "Added by" when the shift was
  never changed after it was added, "Last changed by" when it was. A
  corrected day leaves the line out, since the correction card above says
  who corrected it and when.
- The correction card shows in the view, not in the correction editor, where
  Before and After describe the edit being made.
- In the view, a past day shows no repeating-series card and no preference
  or work-limit warnings: those are about scheduling, and the day is done.

Must not change: who may correct, what a correction saves or records, staff
alerts (none), and today and later days, which still open straight in the
editor. Viewers without Edit shifts keep the read-only Shift details panel
they have now.

### Build steps

1. [x] **Prototype.** The "Past days read-only panel" canvas: a past cell
       opens read only with Correct this day; Back and Cancel return to the
       view; the no-permission, empty and corrected cases; the last-change
       line.
       **Done when:** the owner has reviewed it (2026-11-28).
2. [x] **Panel opens a past day in the view.** In `ShiftEditPanel.tsx`, a new
       `pastDay` prop starts the panel in the view whenever it is set, for an
       empty day too ("Nothing scheduled"); the view footer is the single
       Correct this day button when `correction` is set and nothing when it
       isn't; the button opens the correction editor for this day only;
       Back and Cancel in the editor return to the view; the eyebrow and
       dialog label say "Correct this day" only in the editor; the
       correction card shows only in the view; the last-change line is left
       out on a corrected day; the series card and warnings are left out of
       a past day's view. `SchedulePageClient.tsx` passes
       `pastDay={editPanelIsPast && canEditShifts}`.
       Tests in `__tests__/ShiftEditPanel.test.tsx`: a past day with a
       correction opens the view with only Correct this day; pressing it
       shows the editor with Save correction; Cancel returns to the view; an
       empty past day says Nothing scheduled and offers the button; with a
       past-day notice and no `correction` there is no button; a corrected
       day shows the card and no last-change line; an unchanged shift reads
       "Added by".
       **Done when:** the tests pass, type-check and lint are clean, and a
       browser screenshot shows a past cell opening read only.

### Completed

Built and verified 2026-11-28. Panel suite 134 of 134 (8 new), `npm run
type-check`, ESLint and Prettier clean. In the browser (Calm Haven, local), a
past Day Shift opened as Shift details with only Correct this day; it opened
the editor with Save correction disabled, Cancel returned to the view, and an
empty past day showed Nothing scheduled with the button. The Schedule grid
docs page and the overview's past-days rule now say a past cell opens read
only; the pages citing the changed files were re-fingerprinted.
