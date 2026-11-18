# Fix: Home's wash across both panes, and a floating Schedule calendar

**Type:** Fix
**Status:** verified

## The problem

- On an open iPhone Duo, Home's gradient wash stopped at the divider: only
  the list pane drew it, and the right pane sat on the plain page ground.
- The Schedule tab's calendar was the sticky header itself, a card flush with
  the top of the screen with rounded bottom corners. The canvas shows it as a
  card floating under the month's name, which also reads better in the Duo's
  narrow list pane.

## The fix

- `SplitView` takes an optional `background` painted once behind both panes,
  and `TransparentPaneContext` tells each page inside to leave its ground (and
  sticky header ground) transparent. Both Homes pass their wash there when
  split and draw none of their own. Other split pages are unchanged.
- The calendar's weekday row, dates and handle sit in a rounded card
  (`calendarCard`, the shared card surface) under the month title and
  buttons, on every phone; the header shell is plain page ground again.

## Verify

- iPhone Duo simulator: Home open (My schedule) in dark and light, the wash
  continuous across the divider; Schedule open with the month card; Schedule
  closed with the week strip card and its handle, opened and closed.
