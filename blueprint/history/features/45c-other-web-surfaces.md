# Feature: Every other web surface shows a worked shift plus an absence

**From build-plan:** feature 45c
**Status:** verified

## Goal

A mixed cell such as D/Sick reads the same everywhere on the web as it does
on the Week and 2 Weeks grid: the phone-width schedule, print, both
dashboards, reports, the CSV export, the calendar feed and the activity log
all show the absence after the worked shifts. Hours, tallies and coverage
keep counting the worked parts only, and the absence counts as an absence
with no hours. 45b drew it on the main grid; 45c stops every other surface
dropping it.

## Design reference

No new mockup. Every surface reuses the look it already has for a shift
plus a whole-day absence, in the order the approved 45b mockup set
(<https://claude.ai/artifact/VdE4TYfvinYyQN6f62vrHr>): worked shifts first,
the absence last, in its absence-type colours, with no times. Print follows
the owner's decision (2026-10-19) that a three-item cell gets a taller row
rather than squeezing.

## What already holds (found while mapping, no change)

- **Coverage and tallies:** the grid's count rows, coverage gaps and the
  dashboard coverage cards read assignment ids and segments only, so a mixed
  cell counts its worked parts and never the absence.
- **Hours:** staff hours, the person page metrics and analytics sum segment
  durations only.
- **Month view:** lists who is working each day and skips every absence, so
  a mixed cell's shifts already appear and its absence stays out like any
  other absence there.
- **Person page:** shows metrics, not a day-by-day schedule; recurring shifts
  cannot carry a rest-of-day absence (refused since 45a).

## In scope

- The phone-width schedule (`MobileDayView`, a seven-day list on web).
- Print, including the taller row for a three-item cell.
- `MyScheduleRow` (Admin and Super Admin dashboards) and `UserDashboard`,
  with the absence pill's own change badge.
- The operations reports: absence counts, the activity breakdown, the
  absences and call-offs list, the summary total and the schedule matrix.
- The CSV export, the calendar feed, the activity log line, and the
  Gridmaster schedule view's absence label.
- Public docs that describe those outputs.

## Out of scope

- The mobile app (45d).
- Shift requests and open-shift staffing (45e).
- The existing quirk where `isAbsenceForKey` falls back to a published
  whole-day absence while a draft makes the cell worked (predates item 45).

## Data / contracts (load-bearing)

- **Source fields:** web schedule entries carry `restOfDayAbsenceTypeId`
  and `publishedRestOfDayAbsenceTypeId` (45b); server readers use
  `PublishedScheduleEntry.restOfDayAbsenceTypeId` from
  `resolvePublishedScheduleEntry`. No surface reads `absenceTypeId` to find
  a rest-of-day absence, and none changes `entry.label`, which stays the
  worked segments only.
- **Order and hours:** the absence always comes after the worked shifts and
  carries no times and no hours.
- **Reports:** a rest-of-day absence counts once as an absence for that
  person and day, at 0 hours, and is kept by the same filters that keep a
  whole-day absence.
- **Text form:** where a surface writes one string for the cell (CSV, the
  calendar summary, the schedule matrix), it is the worked label, then
  " / ", then the absence label, for example `D/E / Sick`.
- **Calendar:** the timed shift event keeps the shift's times; its summary
  and description add the absence. No separate all-day event, since that
  would claim the whole day.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

## Build steps

- [x] **Step 1 - Phone-width schedule.** `SchedulePageClient` passes
      `restOfDayAbsenceTypeIdForKey` and the absence-type map to
      `MobileDayView`, which appends the absence pill after the shift pills,
      built like its whole-day absence pill. Tallies and section filters
      stay as they are.
      _Done when:_ a component test shows D/Sick as two pills with the
      absence last in its colours, and the day's tally still counts one
      shift.
- [x] **Step 2 - Print.** `PrintScheduleView` takes the same lookup and
      `resolveCellPills` appends the absence pill with no time. A cell with
      three items stacks its pills and its row grows to fit them; one or two
      items keep today's layout.
      _Done when:_ tests show the absence pill last for D/Sick and D/E/Sick,
      the times staying on the worked pills, and a three-item row taller
      than a two-item one.
- [x] **Step 3 - Change badges reach the absence pill.**
      `resolveCellChangeBadges` (`cellChangeBadges.ts`) returns the absence
      pill's own badge from `restOfDayDiff` in the slot after the worked
      pills, so any surface with an absence pill can show it.
      A removed absence marks the cell "Changed", like a removed second
      shift (it said "Edited", which the cell-level rule hides while the
      shifts survive, so the main grid showed nothing either).
      _Done when:_ tests show adding, removing and changing a rest-of-day
      absence each badge that slot only.
- [x] **Step 4 - Dashboards.** `MyScheduleRow` appends an absence item after
      the worked shifts, counts it in `pillCount`, and carries the
      rest-of-day ids through its deleted-draft and publish-change
      fallbacks. `UserDashboard` pushes an absence item after the worked
      segments, and a removed cell's "Was ..." history line names the
      absence; the hero card still prefers the worked shift.
      _Done when:_ tests show both dashboards listing D then Sick, the hero
      featuring D, and a removed published absence still shown as removed.
- [x] **Step 5 - Reports.** The operations report derives rest-of-day
      absence entries from shift entries and counts them, at 0 hours, in
      staff-hours `absenceCount`, the activity `publishedAbsenceDays` and
      `absenceBreakdown`, the absences and call-offs rows, and the summary's
      `totalAbsences`; the schedule matrix label adds the absence. They
      survive the same filters that keep a whole-day absence.
      _Done when:_ report tests with a D/Sick day show one absence, Sick in
      the breakdown and the absences list, unchanged hours, and `D / Sick`
      in the matrix.
- [x] **Step 6 - CSV export and calendar feed.** The export cell becomes
      `D / Sick`; the calendar's timed event summary and description add the
      absence, with the shift's times unchanged. The Schedule toolbar's
      Export CSV is built in the browser from `shiftNameForKey`, so it gets
      its own `scheduleCsvTextForKey` that adds the absence the same way
      (found in step 7; `shiftNameForKey` feeds another component too).
      _Done when:_ route and feed tests show both, and a whole-day absence
      and a plain shift read exactly as before.
- [x] **Step 7 - Activity log and Gridmaster schedule.**
      `describeScheduleCell` (`lib/audit/registry.ts`) adds ", then an
      absence for the rest of the day" for a worked input with an absence
      type; the Gridmaster schedule route fills `absenceLabel` from the
      rest-of-day absence too. Public docs for reports, export and the
      calendar say how a mixed cell appears.
      _Done when:_ tests cover both lines, and `npm run docs:check` passes.
- [x] **Step 8 - Browser qualification.** On the local app (worktree dev
      server), with a D/Sick and a D/E/Sick draft published: the phone-width
      schedule, print preview, the Super Admin dashboard, the reports and a
      CSV export, light and dark where the surface has both.
      _Done when:_ screenshots show the absence last on each, print's
      three-item row is taller and nothing overlaps, no console errors, and
      the local data is restored afterwards.

## Files / areas

- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`,
  `components/MobileDayView.tsx`, `components/PrintScheduleView.tsx`
- `components/schedule-grid/cellChangeBadges.ts`
- `components/dashboard/MyScheduleRow.tsx`, `components/dashboard/UserDashboard.tsx`
- `features/reports/server/operations.ts`
- `app/api/export/route.ts`, `features/account/server/calendar-feed.ts`
- `lib/audit/registry.ts`, `app/api/gridmaster/schedule/route.ts`
- `docs/` pages for reports, exports and the calendar, and the manifest
- Tests beside each.

## Testing

- Unit and component tests per step (Vitest + Testing Library), each failing
  on the code before it.
- Step 8 is the browser gate, against the 45b look.
- Gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`.

## Notes for the AI

- Say "absence", never "off day"; code says `restOfDay`.
- Absence names and codes come from the absence types; organization labels
  from terminology settings.
- Never count the absence toward hours, coverage or shift tallies.
- The shared local database is used by other sessions: restore any data
  you publish, keep QA sign-ins in Calm Haven, and reset Calm Haven's trial
  if a sign-in starts it.
- Work in this worktree (`.claude/worktrees/45c-web-surfaces`).

## Completion notes (2026-10-21)

- **Not split.** Mapping every reader showed coverage, hours, the Month
  view and the person page already handle a mixed cell, so one spec of
  eight steps covered the rest.
- **Found while building:**
  - A removed absence now marks the cell "Changed", like a removed second
    shift. It said "Edited", which the cell-level rule hides while the
    shifts survive, so the 45b grid showed no marker either.
  - The Schedule toolbar's Export CSV is built in the browser, so it got its
    own `scheduleCsvTextForKey`, beside the server export's
    `publishedCellText`.
  - A removed cell's "Was ..." line on the user dashboard names its absence
    rather than adding a second history row.
- **Evidence:** type-check, lint (0 errors), `test:web` 5,930 passed,
  `test:mobile` passed, build, `docs:check`. Browser check on the local app
  with a published VN/Sick and D/E/Sick: phone width shows the absence
  last; print stacks the three-item cell in a 97px row against 42px, with
  no pill overlapping or leaving its cell (931 cells); the Super Admin
  dashboard shows Visiting Nursing then Sick with the New chip on the
  absence only, light and dark; the report lists both absences at no hours
  (Richard 25.5h, one absence) and the matrix and CSV add the absence. No
  console errors from this work. Local data was restored and republished.
- **Seen, not from this work:** `Toolbar.tsx` logs a React rowGap/gap
  warning when the width changes; the QA Super Admin profile's
  organization was moved to Evergreen Care by another session's sign-ins at
  01:49 UTC.
