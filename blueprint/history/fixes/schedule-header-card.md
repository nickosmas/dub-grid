# Fix: The Schedule tab's calendar header is one white card

**Type:** Fix
**Status:** verified
**Branch:** `fix/schedule-header-card`
**Design reference:** option A on the "Schedule calendar header" canvas (owner, 2026-11-02)

## The problem

- The team Schedule header sat on the same gray as the page, so it read as
  part of the content, and its handle floated between the dates and the area
  capsules.
- The title said "Today, Nov 2" even while browsing another week or month.
- Sometimes after left or right swipes the week strip went blank. Tapping a
  day pinned the calendar to that day's month, and nothing cleared it while
  the calendar was collapsed. A swipe past that month's last (or first) week
  then left no row to draw, and later swipes and Today couldn't bring it back.

## The fix

- The header is one white card, edge to edge, with rounded bottom corners
  (`teamHeaderCard`). The handle sits inside it at its foot.
- The title names the month shown ("November"), with the year only outside
  the current one ("January 2027"). Today stays Home's round arrow, shown
  only away from today and pointing back to it (owner, 2026-11-02, after a
  worded Today button was tried), and the weekdays are single letters.
- A dot marks each day the person works a shift (an absence alone isn't one),
  blue under the selected day. The days come from their own schedule in
  fixed four-week blocks (`getCalendarDotRanges`), since a month can show 42
  days and the API answers at most 31 a request.
- Collapsed, the strip always shows the selected day's month, and tapping a
  day no longer pins one.

## Checks

- Mobile type-check, lint, and the `schedule` and `shared/components` tests
  (367), with new tests for the month title, the worked days and the
  four-week blocks.
- iOS 26.5 Simulator: the card, title, Today and handle; dots under worked
  days in October; swiping from Nov 2 into December keeps the strip drawn;
  the month opens and December's grid is right.
- Not checked: Android, a physical phone, dark mode. After swiping the open
  month to one with no area capsules, the page rested about 45pt high until
  touched; not investigated.
- The staff-only Schedule header (`WeekNavigatorHeader`) is unchanged.
