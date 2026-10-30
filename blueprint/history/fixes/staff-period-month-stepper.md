# Staff page: a month stepper, and What they work under the numbers

**Type:** Fix
**Status:** verified
**Branch:** `fix/staff-period-month-stepper`

## The problem

The staff page's period dropdown (Current week, Pay period, This month, Last
12 weeks, Custom) duplicated the Schedule calendar's own month arrows, and
choosing a month meant opening a menu. The What they work card drew a donut
even for one kind of work, a full ring at 100% beside a single row, which
left most of a full-width card empty.

## The fix

Owner's choice (2026-10-30), option A of three sketched:

- The tabs follow one calendar month at a time, starting with the current
  month every visit. Arrows beside the tabs step a month; **Today** appears
  away from the current month, left of the arrows so they never move under
  the pointer; **Dates** picks any span up to a year, and the arrows then step
  back out to the month it starts or ends in. No choice is remembered.
- The Overview strip always shows this week.
- What they work is part of the numbers card: a single bar split by share
  when there's more than one kind, and a row per shift and job with its focus
  area (when they differ), job, times, count and share. One kind of work is
  one plain row. The rows are the table, so the table toggle is gone.
- The calendar's own arrows, shown only for picked dates spanning months, are
  named "Earlier month in these dates" and "Later month in these dates".

## Verify

- `npm run type-check` (web), eslint on the changed files, and the staff
  page, period, breakdown, calendar and Overview tests.
- `npm run docs:check` after re-recording `person-detail` and `profile`.
- Browser, as `qa-super-admin@dubgrid.test`: October 2026 with three kinds of
  work and with one, stepping to September (Today appears, arrows stay put),
  and Dates Oct 5 - Nov 17 on the Schedule tab.
