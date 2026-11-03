# No "changed since your last visit" toast

**Type:** Fix
**Status:** verified

## The problem

Opening the web Schedule page after time away showed a toast such as "12 shifts
changed since your last visit: 8 new, 4 modified". The grid's publish banners and
change marks already show those changes, and realtime keeps open screens current,
so the toast repeated what the page shows (owner, 2026-11-03).

## The fix

Remove the toast and its once-per-mount guard from `SchedulePageClient.tsx`. The
page still reads the publish history against the last-viewed time before
updating it, so the change marks and banners are unchanged. Mobile never had
this toast.

## Build steps

- [x] Remove the toast. Done when opening Schedule shows no "since your last
      visit" toast and the change marks still appear.

## Verify

`npm run type-check -w apps/web`, ESLint on the file, and the 21 schedule test
files (284 tests) pass.
