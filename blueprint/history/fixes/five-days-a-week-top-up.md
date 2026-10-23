# Fix: Auto-build brings people up to their usual days a week

**Type:** Fix
**Status:** verified
**Branch:** fix/five-day-top-up

## Problem

Auto-build filled only shifts that were short, so people could be left with three or four days off in a week. The owner (2026-10-23): "try to schedule people at least 5 days in a week instead of leaving more than 2 off days. Of course unless their recurring schedules are set to have more off days", and having more people than coverage needs "is ok".

## Decisions (owner, 2026-10-23)

- Usual days are 5 a week, or the weekdays a person's recurring schedule works when they have one (at most 5).
- Each extra day goes to the least-staffed shift the person can take that day, even one already fully staffed.
- To reach 5 days, a build goes past 40 hours a week when it must, and names the person.

## Change

- `planSteps` (schedule-core): after no gap is left, a top-up phase gives one shift at a time to whoever is furthest below their usual days in a Sunday-to-Saturday week. It ranks that person's empty days by keeping days off in pairs, then shift preference, then the fewest staff against what is needed, then the earliest day. Limits, no doubles, absences, waiting requests and Only preferences still apply through availability. It prefers a shift within 40 hours, then takes one over and reports it. It never opens a gap. Only people who work a day in the period are topped up, as with days off.
- The choice reason `weekDays` reads "Up to their usual days" in the build report.
- Web adapter: `usualDaysInAWeek` (from the recurring schedule, each weekday by its latest schedule) and `weekDaysWithPlanned`.
- The Auto-build description and guide say so.

## Checks

- schedule-core: the top-up spreads people over the least-staffed days, leaves alone someone with no shift, stops at the target, skips absences and requests, and goes past 40 hours only to reach the target (283 pass).
- Web adapter: usual days with no schedule, fewer days, the cap and the latest schedule; week counts with planned days (115 pass with the panel tests).
- Headless Playwright on Calm Haven with two temporary Skilled Nursing requirements: a Nov 1 to 14 build gave all 7 scheduled people exactly 5 days in each week (10 shifts, 4 days off), with reasons "Up to their usual days"; each is over 40 hours at 8.5-hour shifts and is named. The build's 98 draft cells and the requirements were removed afterwards.
- `npm run type-check`, `npm run lint` (2 existing warnings), `docs:check:closed`.
