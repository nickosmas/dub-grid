# Fix: Calmer schedule marks, pages that open at their top, and a steady Alerts title

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-schedule-tidy`

## The problem

The owner reported, on the phone (2026-11-04):

- The team schedule put New beside people's names.
- Your Week still marked shifts New on days that had passed.
- On Schedule and Home, content drew under the header for a moment and then
  jumped down, and a new day, week or view opened at the scroll position of
  the last one.
- A page with only an empty state stayed wherever it was dragged instead of
  springing back.
- On Alerts with Mark all read showing, the collapsed title sometimes
  appeared centered for a moment as the large title came back.

## The fix

- Team rows carry no New, Edited or change word beside the name; what changed
  is on the shift's own page.
- Your Week shows no change mark or What changed on a day before today. The
  shift's page still shows what changed.
- `Screen`'s sticky header sits in the page's flow above the scroll view, so
  the page starts under it from the first frame. The content inset, the settle
  scroll and the scroll translation it needed are gone.
- `useScrollToTopOnChange` opens Schedule at its top when the day or week
  changes, and Home when the week or view changes, before paint.
- Under a native header on iOS, the content fills only the height between the
  header and the tab bar (read from the page's native safe area), not the
  whole scroll view, so a page that fits springs back. React Native 0.86 clamps
  a programmatic scroll to the page's own insets, so scrolling it back in code
  could not work.
- `HeaderLeadingTitle` keeps the centered title blank for as long as Mark all
  read shows and only fades the leading title, so iOS never draws its own
  centered title between the two.

## Evidence

- Mobile: type-check, lint and all 1,578 tests pass. New tests cover team rows
  without change words, no New on a past day (it fails on the old code), the
  scroll reset, and the visible-height layout.
- iOS Simulator (local stack, QA account), with screen recordings:
  - a week switch on Home from a scrolled position opens at the top with no
    intermediate frame;
  - a cold launch paints Home's empty state in place;
  - empty Home, Schedule and Requests spring back after a drag;
  - People's large title still folds;
  - on Alerts with unread alerts, scrolling past the fold and back shows the
    title only on the leading edge or hidden, never centered.
- Not seen: Android, and a physical phone.
- Seen but not fixed: Alerts opened once with its large title drawn over the
  search field until the first scroll. It is not part of these changes.
