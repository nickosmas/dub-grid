# Fix: Dashboard schedule cards share one size

**Type:** Fix
**Status:** verified
**Commit:** `30477e60` (built from a chat request, 2026-09-27; archived after
the fact because it skipped `/fix`)

## The problem

The web dashboard's "Your schedule" row (`MyScheduleRow`) sized its day cells
to fill the card with no minimum width, and every text line could break at any
character (`overflowWrap: anywhere`). In a narrow window the cells shrank until
a shift name stood one letter per line, times wrapped mid-range, and cards in
the same week took different heights.

## What changed

- Every day cell has one width, never below 184px: the longest time range
  ("12:00 AM - 12:00 AM", 119px at the 12px metadata size) plus the note icon
  fits on one line. A week fills the card when seven cells fit and scrolls,
  with the existing arrow cues, when they do not.
- Names and job names wrap only between words; a time range never wraps.
  Nothing is truncated, keeping the earlier no-truncation rule.
- The row measures its tallest card and gives every card, and every empty day,
  that height, so a long name that wraps does not leave the rest shorter.
- `MyScheduleRow` lost its `isMobile` prop, which sizing no longer used.

## How it was checked

- Tests in `MyScheduleRow.test.tsx` pin the fixed 184px width, scrolling, the
  word-boundary wrap with an unbroken time, and the shared tallest height;
  dashboard and typography suites passed (119/119), and the pre-push gate
  passed the full web suite (5039 tests).
- Browser, Calm Haven on the local stack: at 1600px every cell was 209px and
  every card 65px with no scroll; at 987px and 375px every cell was 184px, every
  card 65px, and the strip scrolled without scrolling the page. The 375px
  screenshot came back blank, so that width rests on measurements.
