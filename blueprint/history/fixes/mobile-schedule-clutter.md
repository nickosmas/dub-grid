# Fix: The app's Schedule page drops Was lines and dots for removed shifts

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-schedule-clutter`

## The problem

- The calendar header put a dot under days whose only shift a publish had
  removed: the dots read the person's own schedule, which keeps a removed
  shift as history.
- Each team row on the Schedule page drew a "Was ..." line under a changed
  shift, which cluttered a page nobody schedules from.

## The fix

- A dot marks a day only when the person still works a shift there
  (`getScheduledDates` skips removed shifts).
- Team rows no longer show the Was line. The New or Changed mark stays, and
  Your Week on Home keeps its Was and What changed lines (owner, 2026-11-04).

## Checks

- Mobile schedule tests (176), type-check, lint and Prettier. New tests: a
  removed shift gets no dot, and a changed team row shows no Was line (it
  fails on the old screen).
- `docs:check` with re-recorded `mobile-schedule` and `mobile-navigation`
  evidence.
- Not checked on a simulator; checked on the owner's iPhone after release.
