# Feature: 12-hour sweep

**From build-plan:** feature 46g (parent 46, Clear shift-change descriptions)
**Status:** verified

## Goal

Every time of day shown to people reads in 12-hour form, as the owner's
rule requires (`7:00 AM - 3:00 PM`), whatever the browser's locale.

## In scope

- Shift times that were written as `07:00-15:00`: Settings > Jobs (shift
  picker descriptions, the inherited-time caption and the "Using ... from
  the shift" line), the Gridmaster organization Config tab, the Publish
  History fallback rows, the older custom-time tooltip text, and the
  Mentoring detail report (screen, CSV and PDF).
- Timestamps that followed the browser's locale (24-hour outside the US):
  publish tooltips, print stamps, session lists, billing, invitations,
  profile change requests, activity details, Gridmaster views, and the
  mobile session screens now always use 12-hour time. Bare
  `toLocaleString()` calls use `formatDateTimeLabel`, which also drops
  the seconds they showed.

## Out of scope

- Values that are only stored, compared or sent, and native time inputs.
- `generateEmployeeCSV` (no callers).
- "noon" and "midnight" wording (not decided).

## Build steps

- [x] **Step 1 - Shift times** - the seven 24-hour shift-time displays use
      `fmt12h` or `formatScheduleTimeValue`. _Done when:_ the pinned tests read
      12-hour text and pass.
- [x] **Step 2 - Timestamps** - every listed formatter sets `hour12: true`
      or goes through `formatDateTimeLabel`. _Done when:_ type-check, lint and
      the related suites pass.

## Evidence

- Web: 283 related test files (2,828 tests); mobile session tests (45);
  type-check and lint clean.
- Found by a read-only sweep of the four source trees for `slice(0, 5)`,
  `hour12: false`, `hourCycle`, unpinned locale formatters, and CSV and
  report builders.
