# Picker spells names out, no Before and After for new items, notes as switches

**Type:** Fix
**Status:** verified

## The problem

- The shift picker followed the grid's display mode, so in code mode its tiles read "D / S" and absences "X" or "PTO".
- Every Before and After view showed a shift on a day that had nothing as "Before: No shift / After: Added ...", which reads as a change from something.
- The panel's schedule notes used two different styles: full-width rows captioned "Appears as a colored dot" with a Remove button on a single shift, and chips with a joined Remove on each card of a double shift.

## The fix

- The picker always builds its tiles in name mode and spells absences out; the `shiftDisplayMode` prop is gone from `ShiftPicker`.
- `isNewShiftChange` in schedule-core marks a day whose before side is empty. The web and mobile `ShiftChangeCard` show only a "New" side for it, `ShiftChangeWas` and the mobile "What changed" button show nothing, the chip tooltip reads "Added: ...", and the alert text and email read "New: ...".
- The panel's unsaved-changes footer shows Before and After only when an existing shift is changed (an item with status `changed`); additions and removals show none, since the panel already shows the day. The old text summaries it fell back to were removed.
- Notes are one bordered list of rows (dot, name, the shared `Switch`) for a single shift and for each card of a double shift.

## Verify

- Unit tests: `isNewShiftChange`, the text formatter, the alert email, the web card and Was, the chip tooltip text, the mobile card and button, and the panel's footer and note switches.
- Full gate: `npm run type-check`, `npm run lint`, `npm run test:web` (6,279), `npm run test:mobile` (1,504 plus packages), `npm run docs:check`.
- Browser (local stack, grid in code mode): the second-shift picker spells every tile out; notes are switch rows on a single and a double shift; adding Office to an empty day shows no Before and After. A temporary note type was added to Calm Haven for the check and deleted after; the test edits were cancelled and the cells confirmed unchanged.
