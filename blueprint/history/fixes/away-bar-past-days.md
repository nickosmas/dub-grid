# Fix: Away bar on past days

**Type:** Fix
**Status:** verified

## The problem

In the Week and 2 Weeks grid, someone Away until a date (51e) gets the Away
bar only from today on. Their earlier away days show whatever the cells hold,
usually the absence 51f wrote, as ordinary absence runs, so one stretch of
leave reads as "Leave ×7", "Leave ×3", then "Away · Leave" from today.

The cause is in `apps/web/src/components/schedule-grid/awayRuns.ts`:

- `statusRangeOf` returns `{ from: null, until: awayUntil }` for an Away
  person, because the range never learned when the away began.
- `buildRowAwayDays` therefore limits the bar to `dateKey >= todayKey`, so the
  bar can't run back over days that came before the away.
- `withoutAwayDays` (`schedule/_lib/away-coverage.ts`) drops every earlier
  cell of theirs from coverage as well, so a past week they worked counts them
  as missing.

`employees.status_changed_at` already records when they went away: the
status route sets it on Mark away and the return-from-away job sets it when a
planned Away (51g1) starts, and a return-date change leaves it alone.

## The fix

Give the range the day the away began, and use it for drawing and counting:

- `AwayRange` gains `since: string | null`, the org-timezone date of
  `status_changed_at` for someone Away until a date; null when the column is
  empty (older rows), which keeps today's behavior.
- `awayRangeOf` takes the organization's timezone to compute it, with
  `getIsoDateInTimeZone` as `todayKey` uses.
- `buildRowAwayDays` draws the bar on locked days from `since` (or from today
  when `since` is null), past days included, still one bar per stretch and
  week, labeled as today ("Away · Leave").
- Coverage leaves out only the days from `since` on, so days before the away
  count as they were scheduled.

Must not change:

- **Locking.** Every day before the return date stays locked, as
  `employee_schedulable_on` (099) still refuses them. A locked day before
  `since` shows its own cell, with a hint that says they've been away since
  that day and earlier days can't be changed while they're away. Unlocking
  them is part of past-day corrections, not this fix.
- Planned Away (51g1), Last day (51g2), First day (51g4) and their bars and
  hints.
- Coverage suggestions, Auto-build and recurring fills, which already skip
  past days.

## Build steps

1. [x] **Start the away range on the day they went away.** Add `since` to
       `AwayRange`, compute it in `awayRangeOf` from `statusChangedAt` in the
       org timezone, draw the bar from it in `buildRowAwayDays`, count coverage
       from it in `withoutAwayDays`, and add the before-`since` hint to
       `awayLockedHint`. Pass the timezone through from `SchedulePageClient` and
       `ScheduleGrid`. Unit tests in `awayRuns.test.ts` and
       `away-coverage.test.ts`: a bar from `since` across today, across a week
       boundary, starting in a past week, with `since` null, and coverage keeping
       a pre-away shift.
       **Done when:** a person marked away on a past day shows one "Away ·
       <absence>" bar per week from that day, with no break at today; earlier
       days show their shifts and count in coverage; tests, `type-check` and
       `lint` pass.
       Also puts an Away person on the grid for a past period that reaches
       `since` (`isOnScheduleGrid`), so a week they went away in keeps their row.

## Verify

- Mark a QA person away (with an absence) on a local stack, back-date their
  `status_changed_at` a week, and open the 2 Weeks view across today: one
  Away bar per week from that day, the same before and after today.
- Their days before it show their shifts, stay locked, and the hint names
  the day they went away; Coverage counts those shifts.
- Someone with an empty `status_changed_at` still draws from today.
- A planned Away and a Last day still draw as before.

## Outcome

- Verified on the local stack (Calm Haven): Diane Patterson, marked away on
  Tue, Oct 27 until Fri, Oct 30, shows one Away bar from Oct 27 through
  Oct 29, the day before today included; her Sunday and Monday keep their
  own cells, locked, with the "Away since" hint.
- `docs/features/schedule-grid.mdx` now says the bar runs from the day they
  were marked away and earlier days show what they worked; the twelve pages
  citing the changed grid source were re-fingerprinted.
- Build-plan item 53 (past-day corrections, Light tint) was added in the same
  change, with the overview regenerated.
