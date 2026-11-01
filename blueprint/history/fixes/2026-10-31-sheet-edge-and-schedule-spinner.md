# Fix: A scrolled sheet's edge, and the Schedule spinner that never stopped

**Type:** Fix
**Status:** complete
**Completed:** 2026-10-31
**Branch:** `fix/sheet-scroll-edge`

## The problem

- A native sheet whose list scrolls ended on a hard line above the home
  indicator, and the fade added to soften it read as a blur (owner,
  2026-10-31: "scrollable content in sheets should not end in a blur").
- The Schedule tab opened with a refresh spinner turning between its focus
  area capsules, and it never stopped (owner, same day).

## The fix

- With nothing below it, a sheet's scroll body runs on under the home
  indicator (a negative bottom margin of the safe-area inset, given back as
  padding inside the content), as a system sheet's list does. The fade is
  gone.
- `Screen` no longer passes `contentOffset` to the iOS scroll view under a
  sticky header. It moved the content to minus the header's height before the
  matching `contentInset` existed, which UIKit read as a pull past the
  refresh threshold, so every opening started a pull-to-refresh. The settle
  effect already scrolls the content under the header once the inset lands,
  and a settle still pending now survives a second header measurement.

## Verify

- iOS Simulator: Schedule opens with no spinner and the capsules in place;
  Home opens with its hero below the header; People's filter sheet scrolls to
  its bottom edge with no fade and no hard line.
- Mobile suite, type-check and lint.
