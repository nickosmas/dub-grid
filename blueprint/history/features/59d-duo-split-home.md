# Feature: iPhone Duo split view for Home

**From build-plan:** feature 59d
**Status:** verified
**Branch:** `feature/59d-duo-split-home`

## Goal

Open, partly folded or held tall, the iPhone Duo shows Home as a split view:
Home's own page on the left, and on the right the shift now or next ("Your
shift"), or for a day off that day's overview; Team shows today's overview
with who works it. It reuses 59a's frame and 59c's day overview.

## Design reference

- The "DubGrid on iPhone Duo" canvas, rows "Home", "Home: Team", "Day off"
  and "Open shift" (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).
- My schedule: the right pane is the shift page of the shift now or next;
  a shift tapped in Your week replaces it; an Unscheduled day tapped shows
  "You're not scheduled" over that day's overview (coverage for admins, open
  shifts, requests, who works it).
- Team: the day's overview: "You work this day", Coverage, Open shifts,
  Working (each shift with its hours and who works it).

## In scope

- `DayOverview` gains a Working section (the day's roster), an optional
  heading, the viewer's own day for anyone on staff when asked, and loads the
  team's week itself when the page hasn't.
- Staff Home (`ScheduleScreen scope="me"`) and the admin Home's My schedule:
  default pane, picks from the hero and Your week (shifts and Unscheduled
  days), outline of the pick, the fold rule.
- The admin Home's Team: today's (or the stepped week's day) overview.

## Out of scope

- A separate open-shift page: the open-shift card in the list already holds
  Claim or the reason it can't be claimed, so the pane would repeat it.
- Alerts and Profile (59e); This week (59f).

## Build steps

- [x] **Step 1 - Overview additions** - Working section, heading override,
      viewer's day on request, self-loaded week. _Done when:_ Schedule's
      pane is unchanged and a test covers the roster section's input.
- [x] **Step 2 - My schedule split** - shared pick state and pane for both
      Homes; Unscheduled rows press when a handler is given. _Done when:_
      both Homes show the shift now or next beside the list, and picks swap it.
- [x] **Step 3 - Team split** - the admin Team view beside the day's
      overview. _Done when:_ open, partly folded and held tall match the
      canvas on the iPhone Duo simulator, light and dark, and closing with a
      picked shift pushes its page. Held tall, the week header wraps its date
      and names a one-month week's month once ("Nov 15 - 21"). Verified as an
      admin with no shifts this week (My schedule's day off and Team); a
      picked shift reuses 59c's embedded shift page and fold rule.
