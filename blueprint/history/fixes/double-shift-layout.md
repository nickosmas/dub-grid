# Fix: Double shifts drawn like single shifts, stacked when the column is narrow

**Type:** Fix
**Status:** verified
**Branch:** `fix/double-shift-half-marks` (checkpoints ee93898b, 95537ccc)
**Completed:** 2026-10-19

## The problem

On the web schedule grid, the two shifts of a double shift sat side by side as
halves about 30px wide inside (2 Weeks view at 1440px), and their marks covered
their words: the change chip read "dite" and covered the mentored M, the M sat
over the job code once notes took the bottom strip, a timed half showed "7" of
"7–3:30", and a cross-focus half had 15px left for its words.

The owner's rules for grid pills: nothing covers anything else, every word is
spelled out, and note dots take their own row (at most two dots, then a count).

## The fix

Decided with the owner on 2026-10-19, after a measured prototype
(https://claude.ai/artifact/47qJv7UgJQNj8U6oz2HMgh) and a first build that
shrank text to fit the halves (withdrawn before any commit):

1. **Each shift of a double shift is drawn like a single shift's pill:** title
   type, full-size M in the corner, side cross-focus label, regular note dots
   (two, then a count), the same radius and padding.
2. **Side by side when there is room, stacked when there is not.** The pills sit
   side by side while the day column leaves each one a single pill's width
   (76px in code mode, 140px in name mode), as in Week view or on a wide
   monitor. In a narrower column (2 Weeks at 1440px) they stack.
3. **Rows grow only as far as their content needs.** A row holding a double
   shift sets its cells' height from what that cell shows (one or more pills
   down; words, a time line, notes, a change chip), from the same type tokens
   the pills use, and never below the normal cell height. A plain stacked pair
   needs about 66px, a pair with a chip, a time and notes about 105px; a
   side-by-side pair stays at the normal 52px unless a chip and a time need
   a few pixels more.
4. **Stacked pills sit 4px apart**, like a side-by-side pair; the gap widens to
   10px only when the lower pill has a change chip, whose upper half rises into
   it. Each stacked pill is at least as tall as its own lines.
5. **Nothing covers the words.** On a double shift's pill, a raised chip keeps
   its lower half clear above the words (9px reserve) and starts 2px in, so it
   clears the M; a mentored pill's first line keeps the M's room on both sides,
   so it stays centred and clear of the M; the time line keeps the full width.
6. **Note dots sit in the corner** on every grid pill: 2px inside its
   bottom-right corner, as the mentored M sits in the top-right. Their strip
   stays in flow, so the words still leave room for them.
7. **Everything else keeps its normal height.** In a row grown for a double
   shift, single shifts, absences and empty cells keep the normal cell height,
   centred in the taller cell.

Single pills are otherwise unchanged.

## Build steps

- [x] **1. Single-pill drawing for each shift of a double shift.**
      `ScheduleGrid.tsx` multi-pill branch: title, footnote and caption type,
      full-size M, `SINGLE_SHIFT_PILL_RADIUS`, single paddings and side label;
      regular note dots (the `narrow` option of `NoteDots` is removed).
- [x] **2. Side by side or stacked.** `stacksShifts` in `gridHelpers.ts` and
      the laid-out day column width (`dayColumnWidth`) passed to each section; the
      pills sit in a grid of equal tracks (`data-shift-layout`).
- [x] **3. Content-height rows.** `doubleShiftCellHeight` in `gridHelpers.ts`;
      the row sets `--dg-grid-row-cell-height` and every cell uses
      `GRID_CELL_HEIGHT`. The row reads its shift labels and absences once and the
      cells reuse them.
- [x] **4. Chip and M clearance** on a double shift's pills.
- [x] **5. Normal-height cells in a tall row**, a 4px stacked gap, and note
      dots in the pill's corner (`NoteDots` `corner`, `NOTE_LANE_INSET` 2px).

## Verify

- `npm run type-check`: passed. `npm run build`: passed. `npm run lint` on the
  changed files and the pre-commit lint and documentation-contract hooks:
  passed (the five schedule docs pages were re-read and their evidence
  fingerprints re-recorded; their text is unchanged and still accurate).
- `npm run test:web`: 5797 passed, 2 failed. Both failures
  (`gridmaster-direct-writes.integration`, `org-isolation.integration`) compare
  the live local database's policies and grants to the repository inventory;
  the shared local database carries `hidden_internal_user_ids` and
  `internal_hidden_select` policies from another session's unmerged QA-accounts
  migration, which exist on neither `dev` nor this branch. They fail on `dev`
  for the same reason and are unrelated to this UI change.
- Browser (2026-10-19, local Calm Haven, a temporary draft for Richard Bennett
  on Mon 28 Sep with a mentored, timed, edited first shift and two notes on the
  second, removed afterwards): 2 Weeks at 1440px stacks the pair in a 105px row
  with a 4px gap; 1 Week at 1440px keeps it side by side in a 55px row; in both,
  and in the cross-focus section's copy, no mark overlaps any word, mark or other
  pill and no word is cut; the row's off days and single shifts stay 43px tall,
  centred; note dots sit 2px inside the bottom-right corner (the M 0.5px inside
  the top-right).

## Out of scope

- Single pills keep their own chip position: on a single pill at the 2 Weeks
  width the chip still reaches about 0.6px into the M and sits on the top of the
  words when the pill also shows a time. The same clearance would fix it.
- A peer editor's lock avatar still pushes the M inward on the pill in the
  cell's top-right corner, as on a single pill.
- Name mode is covered by the same rules but was not checked in the browser.
