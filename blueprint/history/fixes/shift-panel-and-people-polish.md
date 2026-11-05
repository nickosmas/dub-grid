# Fix: Clearer shift panel, a People table that holds still, and corrected days that say so

**Type:** Fix
**Status:** verified
**Branch:** `fix/shift-panel-and-people-polish`

## The problem

- **Custom time read as already set.** The dashed "Custom time · 7:00 AM - 3:30 PM
  (8h 30m)" button showed the shift's standard time inside the button that overrides
  it, so a past day looked as though someone had typed that time.
- **People columns snapped on open.** The roster table sizes columns to their
  content. Account fills in after invitations load, and Access is a 132px dropdown
  only once the directory loads, so the table reflowed under the reader.
- **A box repeated the two shift cards.** A repeating day opens on a summary, and
  with two shifts its Shift 1, Shift 1 mentored, Shift 2 and Shift 2 mentored rows
  repeated the times and Mentored switches on the cards above it.
- **A corrected day didn't say so.** The panel showed Before and After as a bare
  card with small text under it, and the staff page's list showed only the reason.

## The fix

- **Time row.** "Standard shift time" and its range sit on the left, with a separate
  **Set custom time** button on the right (`PillTimeEditor.tsx`).
- **People.** The Account and Access headers hold a minimum width inside the cell,
  which auto layout can't squeeze, and those cells show a skeleton until their data
  lands (`MembersSection.tsx`, `StaffTableRow.tsx`). A `w-` class on the header wasn't
  enough: the table's content is wider than its minimum, so it ignored the hint.
- **Summary box.** It lists only what the shift above doesn't say: no row a card
  already shows, and Mentored for one shift only when it is on. With nothing left to
  say, there is no box.
- **Corrected day.** A **Corrected day** card in the panel holds who and when, the
  reason, and Before and After, like the "Changed since it was published" card. The
  grid's hover card carries the same label, and the staff page's Schedule list adds
  what the day was.

## Verify

- `ShiftEditPanel`, `ScheduleGrid`, `shift-records` and `schedule-rows` tests pass,
  with new cases for the time row, the corrected card and the two-shift summary.
- Headless Chromium against the local stack, with the directory answer delayed by
  1.2 seconds: every column kept its width from the skeletons to the loaded rows.
  The first pass, with `w-` classes alone, moved Access from 149px to 63px.
- Seen in the app on the local stack: Kenneth Crawford's corrected Oct 30 (panel, hover
  and staff list), Thomas Crawford's Oct 30 (time row), and a two-shift day temporarily
  marked repeating (no box), restored afterwards.
- The month grid on the staff page has no corrected mark, as before; the list does.
