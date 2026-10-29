# Feature: One staff page - Time off

**From build-plan:** feature 55e
**Status:** verified

## Goal

A Time off tab lists the person's absences and time away in the chosen
period, and the Overview shows their next time off.

## In scope

- `lib/time-off.ts`: whole-day absences on days in a row as one entry with
  its day count; part of a day with the time it covers ("11:00 AM - 3:00 PM,
  not worked"); time away now (status changed to the day before the return
  date) and planned, with its absence, without counting those absence days a
  second time; each entry Planned, Now or Taken against the organization's
  today; the organization's day off absence (Schedule Rules) left out unless
  shown.
- `TimeOffTab` with the period control and a Show or Hide toggle named for
  the day off absence.
- Overview's Next time off card, from the next six months, with a button to
  the tab.

## Build steps

- [x] **Step 1 - The model** - `buildTimeOff` and `findNextTimeOff`, tested
      for runs, breaks, the day off, part days, away now and planned, and the
      next entry.
- [x] **Step 2 - The tab and the card** - tested for the rows and the day off
      toggle; the day off id is read from `coverageRuleConfig`.
- [x] **Step 3 - Docs and qualification** - the Time off bullet, the
      Overview line and the period sentence; a browser check of a run of
      days taken.
