# Fix: Coverage Check follows the grid's focus area order, applies all fixes at once, and Auto Fill gets a clear name

**Type:** Fix
**Status:** complete
**Branch:** `fix/coverage-check-focus-area-order` (cut from `dev` at 54905a5c)

## Problem (owner, 2026-10-22)

1. Coverage Check listed focus areas in the order they were loaded, not the
   order Settings gives them, which the schedule grid uses.
2. There was no quick way to accept all suggestions.
3. The Tools menu's **Auto Fill**, which fills empty slots from recurring
   schedules, needed a name that says what it does.

## What changed

- **Order.** The schedule page already ordered focus areas for print the
  way the grid does (by department, then within it). Coverage Check's
  counts, matrix and focus area filter now use that same list. A
  schedule-core test pins that matrix rows follow the order they are given,
  even when the first area's requirement starts on a later day.
- **Apply all.** `planCoverageFixes` in schedule-core plans every draft fix
  (move back, restore, schedule) one at a time: after each it counts the
  schedule again and suggests afresh, so no spot is filled twice and no fix
  undoes another. Approvals are never included, since they publish. No two
  fixes write the same person's same day, and the schedule page tells the
  planner whether a planned shift (at its default times) overlaps a
  candidate on that day or across midnight, so someone can still be
  scheduled on consecutive days. The day view offers **Apply all for this
  day** and the panel **Apply all draft fixes** for the period; the batch is
  one line under Applied, and Undo puts it all back.
- **Name.** Auto Fill is now **Fill from Recurring Schedules**, in the Tools
  menu, its confirmation, its progress title and its messages, which also
  stop saying "recurring templates". The public guides use the new name.

## Evidence

- Unit: the planner fills a gap once however many could fill it, covers
  every date, puts back the draft's own changes before adding anyone, never
  approves, gives one person one fix a day, uses the caller's availability
  to allow consecutive days, and is empty when nothing is short; the order
  test; panel tests for both Apply all buttons and for no Apply all when only
  approvals and advice remain; Toolbar tests under the new name.
- Browser, Calm Haven with two temporary requirements (removed afterwards):
  Apply all draft fixes applied 16 fixes and opened no gaps, and Undo
  restored the published schedule; Apply all for Fri, Oct 23 applied 2 and
  left the day 3/4 with no further fix, and Undo restored it.
- Gates: type-check, lint, `test:mobile`, `test:web`, `docs:check` with the
  affected guides' fingerprints re-recorded.
