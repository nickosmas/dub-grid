# Feature: One staff page - Overview

**From build-plan:** feature 55c
**Status:** verified

## Goal

The staff page's Overview follows the chosen period: its stats count that
period, a This week card shows the current week day by day, and a What they
work donut shows the mix of shifts and jobs they worked, spelled out, in
place of the Assignments bar.

## Design reference

The inline prototypes approved on 2026-10-29 (one change in the build: a
donut with a single slice draws as a full ring): the metric cards as today
(label, value, a line saying what period it covers, the round icon badge);
a This week card with Sun to Sat columns; and the What they work donut (one
slice per shift and job pair, 2px gaps, the total in the middle, a legend
naming the shift, the job and the shift's times with share and count, hover
that fades the other slices, and a Show as table switch). Donut colors are
the validated categorical palette in fixed order (blue, orange, aqua, then
yellow, magenta, green, violet), assigned by the pair's order in the
organization, never by rank; past seven pairs the rest fold into Other.

## In scope

- The period control on the Overview tab.
- Stats for the period: Hours, Average per week, Shifts, and Overtime weeks
  (Sunday to Saturday weeks over 40 hours inside the period), each with a
  line naming the period.
- This week: the current week's seven days, each naming the shift (spelled
  out) or absence, or a dash.
- What they work: the donut over the period, by shift and job.
- Shifts for the period load for the page, separately from the current
  week, so the Custom cap (366 days) is never exceeded.
- Your own `/profile` keeps its current Overview (`OverviewTab`), unchanged.

## Out of scope

- Waiting on you (55f) and Next time off (55e).
- Any change to `/profile`, the slideover or the app.

## Build steps

- [x] **Step 1 - The numbers** - in `lib/staff-detail-stats.ts`,
      `computePeriodHours(...)`
      returning hours, shift count, average per week, overtime weeks and
      the number of weeks, and `computeWorkMix(...)` (the same inputs plus shift and job lookups) returning pairs with shift
      name, job name, time range, count and share, most first, folding past
      seven into Other. _Done when:_ tests cover an empty period, a partial
      week, an overtime week, two jobs on one shift, a shift with no job,
      deleted cells ignored and the fold.
- [x] **Step 2 - Shifts for the period** - the page loads the period's
      shifts (`fetchEmployeeShifts` over the period) and the current week's.
      _Done when:_ changing the period loads that range, and a test shows
      the call's dates.
- [x] **Step 3 - The new Overview** - `StaffOverviewTab` with the four
      period stats, This week, and the What they work donut (legend, hover,
      table view, empty state), and the period control shown on Overview.
      _Done when:_ component tests cover the stat labels for a period, the
      donut legend spelling out shift, job and times, the table view, and the
      empty state; a browser check shows it in light and dark.
- [x] **Step 4 - Docs and qualification** - the Overview line in
      `docs/staff/detail-page.mdx`, fingerprint re-recorded, then the gates.
      _Done when:_ `docs:check`, lint and the related tests pass.

## Data / contracts

- `WorkMixEntry`: `key`, `shiftName`, `jobName` (or null), `time` (or null),
  `count` and `share` (a whole percent); the Other entry's key is `other`.

## Notes for the AI

- Hours use `computeShiftDurationHours`, the same as everywhere else.
- Spell out shift and job names; never show a bare shift code.
- Text in the chart wears text tokens; a colored swatch carries identity.
