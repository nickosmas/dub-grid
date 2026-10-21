# Fix: Note dots take their own row, and pill text shrinks to fit

**Type:** Fix
**Status:** verified
**Branch:** `fix/note-dots-own-row` (cut from `dev` at 040f97fa, rebased onto 5b1388dd)
**Completed:** 2026-10-21

### The problem

The owner's rules for web grid pills (2026-10-19): nothing on a pill covers or
cuts anything else; text shrinks to fit its room rather than being clipped,
ellipsized or dropped; labels stay spelled out; note dots take their own row,
never the end of a text line, and are not too big.

`dev` breaks the last three:

- **Dots end a text line.** A pill with a second line (a custom time, a
  name-mode job line, an absence's "from" time) puts its dots at the end of
  that line (`NoteDots` `placement="line"` inside `NoteDotsLine`, in the
  single, double-shift and no-shift branches of `ScheduleGrid.tsx`).
- **The time spills.** In 2 Weeks at 1440px a single pill is 76px wide, about
  69px inside. "7:30–3:30" is about 61px and its two dots need 25px more, so
  the time runs past the pill. The time span can neither shrink nor
  ellipsize. Found by the refreshed mockup,
  <https://claude.ai/artifact/W4eeN3HauYS3UJ1iicUKQp> (2 Weeks, Codes, Tue).
- **Text is cut.** Shift names, job codes and job names, times on a double
  shift's pill and absence labels end in an ellipsis when they are too wide,
  and name-mode labels are clamped with `WebkitLineClamp`.

### The fix

| Rule        | Value                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dots        | Always in the pill's own 13px strip, 2px inside its bottom-right corner (`lane` with `corner`, as one-line pills do today). Never at the end of a line             |
| Pill height | A pill whose lines plus the strip exceed the normal 43px grows its row, the way a double shift's row does: only as far as its content needs                        |
| Text        | Each pill text line (label, job, time, "from" time) is one line that shrinks, by a measured font scale, until it fits its width                                    |
| Floor       | 50% of the line's size, like mobile's `FitText`. Only past the floor does a line ellipsize, and step 4 proves no real label at a supported column width reaches it |
| Name mode   | A name keeps its two-line wrap when the pill has room for it; a word wider than the pill shrinks rather than breaking or clamping                                  |

Fitting runs as one batch per section, reading every line's width before
writing any size, like `fitPrintText`. It runs after the section renders and
when its day-column width changes, never through one observer per line.
Reuse `fitScale` from `apps/web/src/components/print-fit.ts`, moving it to a
shared module if both callers need it.

It must not break:

- **The double-shift layout** (`blueprint/history/fixes/double-shift-layout.md`):
  side by side at 76px per pill (140px with names), stacked otherwise, rows
  grown by content, the 9px chip reserve and the M's room on a mentored pill.
- **Clearances:** the mentored M, change chips, the focus-area wing, the lock
  avatar, the request fold and the author name keep the room they have today.
- **Striped, joined absences** (`d06b2cac`): an absence's stripes, and pills
  that join (no gap, no border and square corners on the seam) when their
  times meet or an absence follows a shift. The dots sit inside each pill.
- **Everything else in a tall row** (single shifts with no extra line,
  absences, empty cells) keeps the normal height, centred.
- **Hover and screen readers** still name every note; dot states, sizes and
  the two-dots-then-`+n` rule are unchanged.
- **Speed:** the Schedule page renders a 2 Weeks Calm Haven grid no more than
  10% slower than before, measured the same way before and after.

### Build steps

- [x] **1. A fit-to-width line for grid pills.** A small module in
      `apps/web/src/components/schedule-grid/` that marks fit lines
      (`data-pill-fit`; `data-grid-fit` is taken by the grid root), and a batch
      `fitGridText(root)` that sets each line's
      font scale from `fitScale`, with the 50% floor and an ellipsis only
      below it. Tests mock widths, since jsdom has no layout.
      _Done when_ unit tests cover a line that fits (no scale), one that
      shrinks (the right scale), one held at the floor (ellipsis), a second
      pass after rewrapping, and that every width is read before any size is
      written.
- [x] **2. Pill text shrinks instead of being cut.** In `ScheduleGrid.tsx`,
      the label, job, time and "from" lines of single, double-shift, absence
      and deleted pills become fit lines; their `textOverflow: "ellipsis"` and
      `WebkitLineClamp` go. Each section runs `fitGridText` after it renders
      and when its day-column width changes.
      _Done when_ `ScheduleGrid.test.tsx` finds every pill text line marked as
      a fit line with no ellipsis or line clamp, and a test with mocked widths
      shows an over-wide time line given a scale below 1.
- [x] **3. Dots on their own row, and rows that make room.** Every grid pill
      with notes uses the strip; `placement="line"` and `NoteDotsLine` leave
      the grid (remove them if nothing else uses them). Generalize
      `doubleShiftCellHeight` in `gridHelpers.ts` so a single pill whose lines
      plus the strip exceed 43px also sets its row's height. In a cell with
      no shift, the dots sit on a row below its label.
      _Done when_ `gridHelpers.test.ts` gives the new heights (a timed pill
      with notes, a name-mode pill with a job and notes, and an unchanged
      one-line pill), and `ScheduleGrid.test.tsx` finds no `line` placement
      in any branch and the strip on a timed pill with notes.
- [x] **4. Browser qualification.** On the local grid as the QA account,
      light and dark, 1 Week and 2 Weeks at 1440px, codes and names, with
      temporary notes, times, a chip, a double shift and an absence (removed
      afterwards), run the mockup's measurement: no dot or count touching a
      word, the M, the wing, a chip or another pill, and no word cut or
      spilling. Record the smallest font scale any line reached, and the
      render timing before and after.
      _Done when_ both counts read zero in every combination, no line is at
      the floor, the timing is within 10%, and the mockup is updated to the
      shipped layout.

### Step 4 evidence

Local grid, 2026-10-21, as `qa-super-admin@dubgrid.test` at 1440px, with
temporary notes, custom times, a chip, a double shift and an absence in Calm
Haven (all removed afterwards).

- **Dots and words:** all 8 combinations (2 Weeks and 1 Week, light and
  dark, codes and names) read 0 dots touching anything and 0 words cut or
  spilling, across 9 pills with notes and 962 to 1054 fit lines. The closest
  gap is 2px, no line is at the floor, and the smallest scale is 0.85
  (2 Weeks, codes).
- **Speed:** main-thread time (long tasks) per theme toggle, which re-renders
  every section, 24 toggles each on a 938-cell 2 Weeks grid, dev servers side
  by side: 548ms median on this branch against 510ms before, 7.5% slower. The
  fit pass is about 37ms of that (median per toggle); the row-height lookups
  cost under 1ms. An early exit for one-line cells removed an earlier,
  larger gap. A wall-clock harness (click to last DOM mutation) was too noisy
  to separate the two.
- **Mockup:** <https://claude.ai/artifact/W4eeN3HauYS3UJ1iicUKQp> now draws
  the shipped layout and reads 0 and 0 in every Shipped grid.

**Gates** (worktree, rebased onto `dev` 5b1388dd, 2026-10-21):
`type-check` and `lint` pass (2 existing `<img>` warnings); `build` passes
with `next build --webpack` (Turbopack refuses a worktree's symlinked
`node_modules`); `docs:check` passes after re-recording the evidence
fingerprints of schedule-grid, draft-publish, realtime, coverage and
departments-focus-areas, whose text is unchanged and still accurate.
`test:web`: 5978 of 5980 pass. The 2 failures are in
`worked-cell-rest-of-day-absence.integration.test.ts` (identical to
`dev`), refused with "permission denied for table
schedule_publish_changes" because the shared local database carries
another session's unmerged `084_staff_schedule_visibility`; the same file
passed on this branch before that migration was applied.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` and `npm run build`
  pass.
- In 2 Weeks, a shift with a custom time and two notes shows "7:30–3:30" in
  full on its own line, the dots on a row below it, in a slightly taller row.
- A long shift name in name mode reads in full, smaller, with no ellipsis.

### Out of scope

- Month view, the phone-width schedule, print (it has its own fit), the
  dashboard and the mobile app.
- The grid's name column, the open-shifts row and other non-pill text.
- The single pill's change chip, which still reaches about 0.6px into the M
  in 2 Weeks (logged in the double-shift fix); fix it separately if wanted.
