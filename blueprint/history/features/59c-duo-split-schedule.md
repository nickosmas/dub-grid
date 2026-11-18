# Feature: iPhone Duo split view for Schedule

**From build-plan:** feature 59c
**Status:** verified
**Branch:** `feature/59c-duo-split-schedule`

## Goal

Open, partly folded or held tall, the iPhone Duo shows Schedule as a split
view: the schedule on the left with the whole month open, and the chosen
day's overview on the right. Tapping a person shows their shift in the right
pane. It reuses 59a's frame.

## Design reference

- The "DubGrid on iPhone Duo" canvas, rows "Schedule" (admin) and "Staff:
  Schedule" (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).
- Left: the closed page (month title, Today, alerts, the area tabs, each
  shift with who works it) with the month grid open instead of the week strip.
- Right, admin: "Day overview" over the date; Coverage (each area's
  "3 of 4 filled" and a meter); Open shifts ("Day Shift · RN", area and
  times, "You can claim" when the viewer can); Requests this day (who, kind
  and status).
- Right, staff: "You work this day" with their shift; Open shifts; their own
  requests that day, named "You". No coverage numbers.
- A person tapped: their shift's page in the right pane, as the "Your shift"
  row shows for Home.

## In scope

- `DayOverview`, the right pane's default for the selected day.
- `ShiftDetailScreen` embedded in a pane (props instead of route params, no
  native title), and its route returning to the split when pushed by a fold.
- Schedule split: month grid open while split, a picked person outlined, a
  new date clearing the pick, the fold rule from 59a.

## Out of scope

- Home, Alerts and Profile (59d, 59e); This week (59f).
- Claiming from the overview: Claim stays on Home and the shift page.
- The staff Home's "My schedule" view (`ScheduleScreen scope="me"`).

## Build steps

- [x] **Step 1 - Day overview data** - pure helpers that pick the day's
      coverage rows (an area's filled and required that day, only days with
      a requirement), its open shifts and its requests (all for an approver;
      the viewer's own, named "You", for staff), and the viewer's own shift.
      _Done when:_ tests cover each, including an unpublished day (no
      coverage rows) and a staff viewer.
- [x] **Step 2 - DayOverview** - the right pane: heading, Coverage (admins
      only, from the dashboard the admin Home already loads), Open shifts,
      Requests this day (a tap opens the request in Requests), and for staff
      "You work this day" first. Empty sections are left out; a day with
      nothing says so once. _Done when:_ it renders for an admin and staff.
- [x] **Step 3 - Shift page in a pane** - `ShiftDetailScreen` takes the
      shift as props when embedded, sets no native title, and its route goes
      back to the split when it was pushed by a fold. _Done when:_ the route
      behaves as before on a phone (existing tests pass).
- [x] **Step 4 - Schedule split** - while split the month grid is open and
      its handle hidden, a person's row picks their shift (outlined) and the
      right pane shows it, a new date returns to the day overview, and
      closing with a pick pushes the shift page. Held tall, the narrow list
      puts each role pill under the name and each shift's hours under its
      title. _Done when:_ open, partly folded and held tall match the canvas
      on the iPhone Duo simulator, light and dark, and closing with a pick
      keeps the shift in view (verified as an admin with temporary coverage
      rules and a request in Calm Haven, since removed; the staff side by
      the overview helpers' tests).

## Files / areas

- `apps/mobile/src/features/schedule/` (screen, new `DayOverview`, its
  helpers and tests), `ShiftDetailScreen.tsx`.
- `apps/mobile/src/shared/layout/` reused unchanged.

## Data / contracts

- No server change. Coverage comes from `GET /dashboard` (admins and Super
  Admins, as Home), open shifts and requests from `GET /shift-requests`, the
  roster from the org schedule the page already loads.

## Testing

- Unit tests for the overview helpers; the existing Schedule and shift page
  tests unchanged.
- iPhone Duo simulator screenshots in all four poses, admin and staff,
  light and dark.
- `npm run test`, `npm run type-check`, `npm run lint`, the docs gate.

## Notes for the AI

- Insights must be exact: coverage is the dashboard's own per-day count, and
  a day without a requirement or not yet published shows no number.
- Staff never see coverage numbers.
