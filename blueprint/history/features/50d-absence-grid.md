# Feature: Absences beside a shift sit in time order on the web

**From build-plan:** feature 50d
**Status:** complete
**Completed:** 2026-10-25
**Type:** Feature

## Goal

Every web surface that draws a worked cell's absence puts it where it
happened: after the shifts when someone left early, before them when they
arrived late, joined to the shift whose time it meets, and naming the time it
covers. Today the absence always comes last, joined, and the grid says only
"from 11".

## Design reference

The "Absence beside a shift" canvas, Grid board
(<https://claude.ai/artifact/9nZXQZhWYybGo33LXqeoH1>): "Sick 11 AM - 3 PM",
"PTO 7 AM - 11 AM" before "D 11 AM - 3 PM", and "Sick Fri 3 AM - 7 AM" after a
Night shift.

## In scope

- One shared layout (`lib/absence-pill.ts`): first or last, joined or not, and
  the span short ("11–3", "Fri 3–7") and long ("11:00 AM - 3:00 PM"), from the
  entry's shift times and stored span (50b).
- Week and 2 Weeks grid (order, seams, the span line, hover card time, the
  cell's spoken label), print, the phone-width Day view (order and seams; it
  shows no times), the staff dashboard's My schedule row and the admin
  dashboard's list.

## Out of scope

- Month and the person page draw no absence pill (45c), so nothing changes.
- Before and After, alerts, push, activity log, publish history, reports, CSV,
  calendar and the dashboards' "Was" summaries (50e).
- The internal Gridmaster read-only schedule (a plain chip, unchanged).

## Build steps

- [x] **Step 1 - Shared layout.** `layoutAbsencePill` and `layoutEntryAbsence`
      with the side rule from 50c (`absenceSideOf`, now judged from the work's
      span so a long left-early day is not read as arrived late).
- [x] **Step 2 - Grid.** A `restOfDayAbsenceLayoutForKey` accessor beside
      `restOfDayAbsenceTypeIdForKey`; pills take their place by CSS `order`,
      seams and gaps follow that order, and the absence shows its span.
- [x] **Step 3 - Print, phone Day view and dashboards.** The same layout.
- [x] **Step 4 - Checks.** Tests, browser, gates.

## Completion notes (2026-10-25)

- **Side rule:** 50c's first heuristic compared distances from the work's
  start only, which read a 19:00-23:00 absence after a 7:00-19:00 day as
  arrived late. It now asks whether the absence starts within the work's span
  (left early), and otherwise which edge it is nearer.
- **Badges:** the dashboards' change badges count the absence after the shifts,
  so My schedule matches them in that order and moves the absence first after.
- **Weekday:** an absence past midnight names the next day once ("Fri 3–7").
  Shift pills keep the grid's existing "+1" mark.
- **Evidence:** 10 layout tests; grid tests for the span, an arrived-late pill
  first and joined, and a gap; print and Day view order tests; a My schedule
  test for an arrived-late absence first with its time. Browser (worktree dev
  server, local Calm Haven, QA super admin): Richard Bennett's Wed 10/28 with
  Sick arrived late at 11:00 AM drew "S 7–11" above "D 11–3:30", joined, and
  the cell reads "Sick 7:00 AM - 11:00 AM, then D"; no console errors; the
  draft was discarded.
