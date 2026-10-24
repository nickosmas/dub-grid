# Fix: A clearer shift panel and a polished shift picker

**Type:** Fix
**Status:** verified
**Branch:** `fix/shift-panel-redesign` (cut from `dev` at abcb30f5)

## Problem

Tapping a repeating item shows "Repeating: edit scope" at the top of the
panel. It reads as if it governs everything below it. In fact it only
reaches Remove and a change to the shift itself; "Edit dates and pattern"
always covers the whole series. The panel never says how often the item
repeats, its dates, or which day this is. A one-off item puts every editor
inline with Remove at the top of the page, and the picker's tiles, headings
and selected state need polish.

## Decisions (owner, 2026-10-24)

The design reference is the "Shift panel" canvas
(https://claude.ai/artifact/5TqVxsVSiTZX7Cc5JHUMgf).

- **View first for repeating items only** (owner, 2026-10-24, revised
  mid-build). Tapping a repeating item shows what it holds and its series,
  with Remove and Edit at the bottom. Every other filled cell opens
  straight in the day editor, with Remove inside it; an empty cell still
  opens the picker.
- **Prominent names.** The shift name leads each item card in large type,
  with the job under it and the item's color tile beside it.
- **Ask which days at the moment of acting.** On a repeating item, Edit
  and Remove each open a dialog: This day only, This and later days, This
  and earlier days, All days in the series. Each choice shows its dates
  and count. The persistent scope box goes away.
- **Dates and pattern belong to All days.** Only that choice can change
  the frequency, days, start and end.
- **Picker keeps today's structure, polished.** It keeps the segmented
  focus-area control, groups by shift, the 3-column tiles, General and
  Absences. It has no search. The selected tile gets a blue ring and no
  check mark.
- **Display mode.** Picker tiles and the panel's item cards follow the
  organization's shift display mode: codes in code mode, full names in
  name mode, with the full name on hover in code mode (owner, 2026-10-24).
- **Clashing second shifts.** They are listed under "Can't be added" only
  when the organization enforces conflict prevention. Otherwise overlaps
  stay allowed with today's same-day overlap warning, as the panel
  intends.
- **Custom times.** A shift with custom times offers one button, "Reset to
  standard shift time (3:00 PM - 11:00 PM)" (owner, 2026-10-24).

## The fix

- **Panel view.** The view has these parts:
  - Item cards: shift, job, time and hours, focus area, mentored, and
    notes. A day with two shifts shows "Shift 1" and "Shift 2", and an
    absence for the rest of the day shows when it starts.
  - A status block: "Not published yet", or "Changed since it was
    published" with Before and After from the shared change model
    (item 46).
  - For a repeating item, a series card: the pattern ("Every week on Mon
    and Wed"), the range and day count, "Day 2 of 4", and a mini
    calendar. The calendar highlights this day and marks days changed on
    their own. A day changed on its own also says what the series has.
  - The last-change line.
  - A footer with Remove (or "Clear day" when the day holds several
    items) and Edit.
  - When staff open their own shift, the footer keeps the request
    actions.
- **Day editor.** Edit opens the existing editors behind a Back header:
  - Change and remove for each item, plus times, mentored and notes.
  - Add a second shift or an absence.
  - "Make it repeat", which says why when it is unavailable.
  - A Cancel / Save changes footer replacing today's Undo / Confirm.
- **Which-days dialogs.**
  - Remove's button counts what it removes ("Remove 3 days").
  - This day only opens the day editor for the day.
  - This and later or earlier opens the day editor for that range. It
    shows only what reaches every chosen day (the shift or absence, and
    mentored) and says that times and notes change one day at a time.
  - All days opens a series form. It holds the item, with Change, plus
    the pattern fields and the choice for days already in the series.
    Save writes the item change first, then the pattern. If the second
    write fails, the error says what was saved.
- **Series data.** `getShiftSeries` also returns the dates whose state
  differs from the series.
- **Picker.**
  - Group headings name the shift with its time and hours. Today's count
    pills and divider lines go.
  - Tiles are a uniform height and fully opaque, with no hover lift.
    Long labels end in "…".
  - General reads "No set shift", and Absences reads "Whole day · no
    hours".
  - Adding a second shift shows what the person already works, then lists
    the shifts that clash under "Can't be added", each with its reason.
- **Must not break:**
  - Draft and publish, and the scoped series writes (`seriesScope`).
  - Recurring fills and edit-session staleness checks.
  - The guided tour anchor `data-tour="shift-picker"`.
  - The staff request flows.

## Steps

- [x] **Step 1 - Picker polish** - restyle `ShiftPicker` per the canvas,
      and add a tested helper that sorts second-shift options into ones
      that fit and ones that clash, each clash with its reason.
      _Done when:_ helper tests cover the same shift, an overlap and a
      fit; the browser shows the new headings, tiles and selected ring,
      and the second-shift list.
- [x] **Step 2 - Series facts** - tested helpers describe a pattern, lay
      out the calendar weeks and place a day in the series; the
      `getShiftSeries` route returns `changedDates`.
      _Done when:_ helper and route tests pass.
- [x] **Step 3 - View first** - the panel's view mode with item cards,
      status, series card, last change and the Remove / Edit footer; the
      scope box and "Edit dates and pattern" button go.
      _Done when:_ the browser shows a one-off shift, a two-shift day with
      an absence, and a repeating absence as on the canvas.
- [x] **Step 4 - Day editor** - Edit opens the day editor with Cancel /
      Save changes; Back returns to the view.
      _Done when:_ a browser run changes a one-off shift's time and
      mentored, saves, and the grid and database agree.
- [x] **Step 5 - Which days** - the Edit and Remove dialogs, the scoped
      day editor and the All days series form.
      _Done when:_ browser runs remove "This and later" with the counted
      button, change the shift for all days, and change the shift and
      pattern together; the grid and database agree each time.
- [x] **Step 6 - Docs** - the schedule editing and recurring shifts guides.
      _Done when:_ `npm run docs:check` passes.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` (picker, series
  helpers, route, editor session), `npm run docs:check`.
- Browser on the local stack as `qa-super-admin@dubgrid.test` in Calm
  Haven:
  - One-off, two-shift and repeating cells read as on the canvas.
  - Each which-days choice does what it says.
  - The picker matches the canvas.
- Test data made for the check is removed afterwards.

## Built differently from the canvas

- **All days.** The edit of the shift itself and the dates and pattern save
  separately: the day editor's Save changes applies the shift to every day,
  and "Edit dates and pattern" (under All days) opens the existing pattern
  form, which saves on its own. One combined save would need two writes that
  can half-succeed.
- **Day editor top card.** The colored card the editor already had is kept
  for every view (owner, 2026-10-24), with the focus area inside it. A
  double shift's headers sit inset with concentric corners.
- **Buttons** follow the app: no icons on Edit, red for Remove.

## Verification

- `npm run type-check`, `npm run lint` (0 errors), Prettier, and `npm run docs:check`
  (34 verified) pass.
- Tests: `ShiftEditPanel.test.tsx` (87), `typography-contract.test.ts` (24),
  `series-summary.test.ts` (17), `shift-picker-groups.test.ts` (8) and the manage route
  (55) pass. `org-isolation.integration.test.ts` fails only on the shared local
  database's migration 091 (`employee_job_preferences`), which another session added.
- Headless browser on the local stack as `qa-super-admin@dubgrid.test`: a test repeating
  Vacation (Mon and Wed, Nov 16 to 25) showed its view and calendar ("Day 2 of 4"), the
  Edit and Remove choices with dates and counts, and the All days editor. Removing
  "This and later days" left only Nov 16 in the database; removing the rest left no
  cells and archived the series.
- Browser pane: a one-off cell opens in the editor; a double shift shows the inset
  headers, focus areas inside them, the standard-time reset and the repeat reason.
