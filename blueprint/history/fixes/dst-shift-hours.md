# Fix: shift hours count real time across daylight saving changes

**Type:** Fix
**Status:** complete
**Branch:** `fix/dst-shift-hours`

### The problem

Every place that turns a dated shift into hours does clock arithmetic: end
minus start, plus 24 hours when the shift crosses midnight. A 11:00 PM to
7:00 AM shift counts 8 hours every night, including the night clocks spring
forward (7 hours actually worked) and the night they fall back (9 hours
worked). In the US in 2026 those nights are March 8 and November 1. Care
facilities run night shifts, so every overnight worker is miscounted twice a
year, and the fall-back hour that was worked is never counted.

There are five separate copies of the arithmetic, all clock-based:

| Copy                                  | Where                                                                              | Feeds                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `durationHoursFromTimes`              | `packages/schedule-core/src/hours-assembly.ts:57` (via `computeShiftSegmentHours`) | web `computeShiftDurationHours` in `lib/dashboard-stats.ts`, then `staff-detail-stats.ts` (staff page period hours), `shift-records.ts`, `published-shifts.ts`; Auto-build hours and the 40-hour week in `schedule/_lib/coverage-suggestions.ts`; mobile dashboard in `packages/mobile-api-core/src/dashboard.ts` |
| `getRangeDurationMinutes`             | `packages/schedule-core/src/schedule-time.ts:193`                                  | `buildWeeklyHoursSummary` and `getSegmentScheduledMinutes` in `schedule-core/src/index.ts` (mobile weekly hours), shift-change text in `shift-change.ts`                                                                                                                                                          |
| `durationFromTimes`                   | `apps/web/src/lib/published-shifts.ts:368`                                         | published `durationHours`, then `lib/analytics.ts` and Reports                                                                                                                                                                                                                                                    |
| `getSegmentDurationHours`             | `apps/web/src/features/reports/server/operations.ts:700`                           | Reports Staff hours, overtime and mentoring hours, and their CSV and PDF exports                                                                                                                                                                                                                                  |
| `calcTimeDuration`, `calcNetDuration` | `apps/web/src/lib/utils.ts:188`                                                    | Settings (Jobs, Shift Categories) and the shift editor (`PillTimeEditor`, `ShiftEditPanel`)                                                                                                                                                                                                                       |

No SQL computes hours. `assert_non_overlapping_work_assignment_times`
(migration 094) compares clock minutes for overlap, which is correct as it is:
an overlap is a question about clock times, so this fix needs no migration.

### The fix

Add one shared helper to `packages/schedule-core/src/dates.ts`, built on the
existing `getZonedMidnightUtc` and `getTimeZoneOffsetMinutes`:

- `getZonedInstant(isoDate, "HH:MM", timeZone)` - the UTC instant a clock time
  on a date names in the zone. A clock time that never happens (inside the
  spring-forward gap) moves forward by the gap; one that happens twice (the
  fall-back hour) takes the first occurrence. This is the "compatible" rule
  that Temporal and calendar apps use.
- `getElapsedShiftMinutes(isoDate, start, end, timeZone)` - minutes between the
  start on `isoDate` and the end on the same date, or the next date when
  `end <= start`. With no zone it falls back to UTC, which has no DST, so it
  returns the clock arithmetic used today.

Then pass each dated shift's `date` and its organization's `timezone` into the
helper wherever the copies above compute hours for a dated shift, and remove
the local copies in `published-shifts.ts` and `reports/server/operations.ts`.
Breaks are still subtracted after the elapsed time.

Must not change:

- **Durations with no date.** A shift template's length in Settings and
  picker labels such as "8h" stay clock arithmetic, because a template has no
  date to apply a change to. `calcTimeDuration` and `calcNetDuration` keep
  their behavior for those callers.
- **Overlap, coverage and "who is on at 3 AM".** These stay clock-based
  (`rangesOverlap`, migration 094).
- **Flat-duration shifts.** A shift with only a duration field (no start or
  end time) keeps that duration.
- **Times shown to people.** Nothing about how times are displayed changes.
- **The Auto-build week.** It stays Sunday to Saturday; only the hours summed
  inside it change.

Out of scope: blocking or warning when someone types a time inside the skipped hour. The
helper resolves such a time deterministically, so hours stay correct without
it. Raise it as its own fix if wanted.

### Build steps

1. [x] **Shared helper with tests.** Add `getZonedInstant` and
       `getElapsedShiftMinutes` to `schedule-core/src/dates.ts` and export them.
       Tests in `dates.test.ts`: New York 23:00 to 07:00 counts 420 minutes on
       2026-03-07 (spring forward), 540 on 2026-10-31 (fall back) and 480 on an
       ordinary night; a 07:00 to 15:00 day shift on either change day counts
       480; a start inside the gap (02:30 on 2026-03-08) resolves to 03:30; a
       repeated time takes the first occurrence; Santiago's missing midnight
       resolves forward; a null zone returns clock arithmetic.
       **Done when:** the new tests pass and nothing else changed.

2. [x] **schedule-core hours use it.** `computeShiftSegmentHours`,
       `getSegmentScheduledMinutes`, `buildWeeklyHoursSummary` and shift-change
       hour text take an optional `{ date, timeZone }` (the entry date where it
       already has one) and use `getElapsedShiftMinutes` when given, with each
       split-shift segment measured on its own. Existing tests stay green; add
       one test per function for a fall-back overnight shift. Rebuild packages.
       **Done when:** `npm run test:mobile` and `npm run type-check` pass, and
       callers that pass no zone get identical results.

3. [x] **Web reports, staff page and Auto-build pass the zone.** Thread the
       organization's `timezone` into `computeShiftDurationHours`,
       `published-shifts.ts`, `reports/server/operations.ts` (removing
       `getSegmentDurationHours`' local arithmetic and `durationFromTimes`),
       `staff-detail-stats.ts`, `shift-records.ts`, `lib/analytics.ts` and
       Auto-build's `coverage-suggestions.ts`. The shift editor's hour readout
       for a dated cell uses the helper too; Settings templates do not. Read the
       zone from where each surface already loads organization settings, never
       from the browser.
       **Done when:** a test in the reports server suite shows a 23:00 to 07:00
       shift on 2026-10-31 in `America/Los_Angeles` reporting 9 scheduled hours,
       and `npm run test:web`, `npm run type-check` and `npm run lint` pass.

4. [x] **Mobile hours pass the zone.** `packages/mobile-api-core/src/dashboard.ts`
       and the mobile weekly hours summary pass the organization's timezone that
       the mobile API already returns.
       **Done when:** a `mobile-api-core` test shows the fall-back night counting
       9 hours and `npm run test:mobile` passes.

5. [x] **Mark shifts that span a clock change.** Added by the owner
       (2026-11-27): affected shifts need a visible indicator. Shared
       `getShiftClockChange(start, end, { date, timeZone })` and
       `formatShiftClockChange(minutes)` in schedule-core give how far the
       clocks move during a shift (+60 back, -60 forward, null otherwise) and its
       words. The shift's time line then reads "11:00 PM - 7:00 AM · 9 hours ·
       clocks go back 1 hour" in the shift editor and the grid's hover card, and
       the time editor's Duration reads "9h · clocks go back 1 hour". The editor
       and grid's Before and After text counts the same real hours. The grid
       pill itself is not changed, so nothing is obscured.
       **Done when:** schedule-core tests cover the forward, back and no-change
       cases, and the editor and hover card show the note for a 11:00 PM to
       7:00 AM shift on Sat Oct 31, 2026 in `America/Los_Angeles`.

### Verify

- Unit tests above, plus `npm run type-check`, `npm run lint`, `npm run test`.
- In the local app, in an organization set to `America/Los_Angeles`: give
  someone 11:00 PM to 7:00 AM on Sat Oct 31, 2026 and publish (a past-day
  correction works too). Reports > Staff hours shows 9h for that shift and
  its CSV matches; the person's staff page period hours include 9h; the same
  shift on Sat Nov 7 shows 8h.
- Auto-build for the week of Nov 1 counts the 9 hours toward the 40-hour week.
- Settings > Shift Categories still shows an 11:00 PM to 7:00 AM template as
  8h.

### Outcome (2026-11-27)

- Checks: `npm run type-check`, `npm run lint`, `npm run test:mobile`,
  `npm run docs:verify`, and the web test files touching the change (the full
  `npm run test:web` run's two analytics failures were the new timezone query
  missing from its mock, fixed and re-run). Reports, staff page, dashboard,
  Auto-build and mobile hours each have a test for the fall-back night.
- Browser: a draft 11:00 PM - 7:00 AM shift on Sat Mar 13, 2027 in Sunrise
  Senior (`America/Los_Angeles`) showed "7 hrs · clocks go forward 1 hour" in
  the hover card and "7h · clocks go forward 1 hour" in the time editor; the
  draft was removed afterwards.
- Docs: Reports and the schedule grid page say how a shift across a clock
  change counts; 19 pages whose evidence changed were re-read and
  re-fingerprinted.
- Left as they were: the Before and After hours in schedule-change alerts,
  the mobile shift-change view, Publish History and the activity logs still
  count clock hours, since those surfaces don't load the organization's zone.
