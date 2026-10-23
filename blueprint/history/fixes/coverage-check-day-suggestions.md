# Fix: Coverage Check suggests by day, marks the days, and says exactly what each fix does

**Type:** Fix
**Status:** complete
**Branch:** `fix/coverage-check-day-suggestions` (cut from `dev` at cd2f590f)

## Problem (owner, 2026-10-22)

1. The suggestions list at the top of Coverage Check is long and
   overwhelming. Suggestions should appear only once a day is selected, and
   the list at the top goes.
2. Dates that have suggestions should carry a marker.
3. Each suggestion must be as clear as possible, leaving no room for
   confusion.

## Decisions (made for the owner)

- **A day is selected by its date.** In the matrix, each date heading
  becomes a button for editors. Selecting a date shows that day: how many
  staff it is short and every suggestion for it across the requirements
  shown (the focus area filter applies). Selecting a cell still shows the
  cell's detail with its own Ways to fix; a date and a cell are never
  selected together.
- **The Applied list stays above the matrix**, only while something was
  applied in this visit, because Undo has to stay reachable once the list
  of suggestions is gone.
- **The marker** is a dot under the date of any day with a suggestion that
  can be applied (patterns are advice, not fixes, so they do not mark a
  day). The legend explains it, and the date's accessible name says it.
- **Every suggestion reads complete on its own:**
  - the title names the action, the person, the shift with its job, and the
    date (and, for a move, both dates);
  - the detail says why it is suggested;
  - an outcome line says what applying does: a draft change that staff see
    after a publish, or, for an approval, a publish right away;
  - one line per cell it changes: the date, focus area and requirement,
    the count now and after, and whether it is then short, staffed or over.

## Build steps

- [x] **Step 1 - Wording** - `describeCoverageSuggestion` in
      `packages/schedule-core/src/coverage-suggestion-text.ts` gains the
      complete titles, an `outcome` line and `changes` (one line per changed
      cell, from the suggestion's measured effects, through a new
      `rowLabel` lookup).
      _Done when:_ the text tests cover every kind's title, outcome and
      change lines, including a two-cell move and a fractional count.
- [x] **Step 2 - Day selection and marker** - `CoverageMatrixGrid` date
      headings are buttons with the dot; `CoveragePanel` drops the top list,
      keeps Applied, and shows a day section (`CoverageDayDetail`) for a
      selected date.
      _Done when:_ component tests cover selecting a date, the dot and its
      accessible name, no list before a date is picked, the day's
      suggestions, a day with gaps and no fixes, and Applied with Undo.
- [x] **Step 3 - Browser check** - on the local app as `qa-super-admin`,
      with a temporary draft change that produces suggestions (discarded
      afterwards): the dots match the days that have suggestions, a date
      shows only its own, the wording reads as specified, Apply and Undo
      still work, and phone width fits.

## Also (owner, 2026-10-22, during the build)

- **Repeated suggestions.** The owner saw "Schedule Alice Mburu for Day
  Shift on Fri, Oct 23" twice. The engine already keeps one suggestion per
  action (same person, date and shift); the repeats were different Day Shift
  definitions in different focus areas, whose titles never named the area.
  Every title now names the shift's focus area, and a test pins one action
  appearing once even when it fills two short requirements.

## Out of scope

- The suggestion engine's choices, mobile, and the Publish dialog.

## Result

- The top list is gone. Date headings are buttons for editors, with a dot
  on each date that has an applicable suggestion; selecting a date shows
  that day's suggestions under "Suggestions for <date>". Applied with Undo
  stays above the matrix.
- Every suggestion names the person, the shift with its job and focus area,
  and the date; says why; says what it fills ("Closes 1 gap" or "Fills 1
  spot"); lists each requirement it changes with its count now and after;
  and says whether it changes only the draft or publishes right away.
- Browser check on Calm Haven with two temporary requirements (removed
  afterwards): nine dated dots, Fri, Oct 23 listed only its two
  suggestions, Schedule applied and Undo restored the draft, and phone
  width stacks each action under its text with no overflow.
- Gates: type-check, lint, `test:mobile`, `test:web` (6,123 tests),
  `docs:check` with the two coverage guides' fingerprints re-recorded.
