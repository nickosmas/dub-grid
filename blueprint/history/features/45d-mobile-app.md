# Feature: The mobile app shows a worked shift plus an absence

**From build-plan:** feature 45d
**Status:** verified

## Goal

A mixed cell such as Day then Sick reads the same in the Expo app as on the
web: the Schedule tab (Your Week, the hero card and the team list), shift
detail, and Home's "Your schedule" card show the absence after the shifts,
in its absence-type colours and with no times. Hours, availability and
coverage keep counting the worked parts only. Today the phone already
receives the absence id but every screen drops it.

## Design reference

No new mockup. The absence uses the app's existing absence chip
(`buildAbsenceChip`, eyebrow "Absence") placed after the shift chips, the
order the approved 45b mockup set
(<https://claude.ai/artifact/VdE4TYfvinYyQN6f62vrHr>). Mobile design
primitives and text tiers apply (`JobPill`, `MeTypePill`, `fit="compact"`
for chip labels).

## What already holds (found while mapping, no change)

- **Payload:** every schedule entry's `state` keeps `absenceTypeId` on a
  worked cell (contracts, `buildStateFromSnapshot`, the mobile mapper).
- **Hours and availability:** weekly hours, overtime, coverage and open
  shift availability read segments only, so the absence adds no hours.
- **Person detail:** has no schedule view on mobile.
- **Requests:** Drop and Swap on a mixed cell treat it as worked, which is
  correct for the shift; what requests do with the absence is 45e.

## In scope

- An optional `presentation.restOfDayAbsence` on mobile schedule entries,
  filled by the server for the current and previous presentation.
- Schedule tab: Your Week rows, the hero card, the team list.
- Shift detail.
- Home's "Your schedule" card, including its spoken label.

## Out of scope

- Shift requests and open-shift staffing with a mixed cell (45e).
- Whether someone absent for the rest of the day should be offered a later
  open shift that day (a policy question for 45e).
- Editing schedules on mobile (web-only by design).
- Change descriptions ("What changed", "View previous shift" and Your
  Week's "Was" blocks): 46d moves mobile onto the shared change model
  (46a), which already describes a rest-of-day absence. Until then an
  absence-only change shows its badge without a line.

## Data / contracts (load-bearing)

- **New optional field:** `resolvedSchedulePresentationSchema` gains
  `restOfDayAbsence?: { absenceTypeId, label, name, color, borderColor,
textColor } | null`. Optional so an older app or server keeps working.
  The server fills it only when `state.kind === "worked"` and the absence
  type resolves; segments, start and end times never include it.
- **Order and hours:** the absence always comes after the shifts, with no
  times, and is never turned into a segment (weekly hours, overtime and
  availability would start counting it).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

## Build steps

- [x] **Step 1 - The payload names the absence.** Add the optional
      `restOfDayAbsence` to the presentation schema; `buildPresentation`
      (`apps/web/src/features/mobile/server/data.ts`) fills it from the
      worked state and the absence label map, for `presentation` and
      `previousPresentation`.
      _Done when:_ contract tests accept it present, null and missing, and a
      `fetchMobileScheduleEntries` test returns it for a D/Sick cell, with
      the segments and times unchanged, and null for a plain shift.
- [x] **Step 2 - The absence chip.** In `scheduleScreenChips.ts` a
      `buildRestOfDayAbsenceChip(entry)` returns an absence chip from
      `presentation.restOfDayAbsence` (null without one).
      _Done when:_ unit tests cover the chip and its absence colours, and
      `buildWeeklyHoursSummary` still counts only the shift for a D/Sick
      cell.
- [x] **Step 3 - Schedule tab.** Your Week adds an absence row after the
      entry's shift rows; the hero card shows an absence pill beside the
      featured shift's pill; the team list draws a second `JobPill` after
      the shift's.
      _Done when:_ `ScheduleScreen.test.tsx` shows the absence after the
      shift in Your Week and the team list, and in the hero beside a
      featured D/Sick shift.
- [x] **Step 4 - Shift detail.** The header pill row adds the absence pill
      after the shift's, and a "Rest of the day" row names the absence.
      _Done when:_ `ShiftDetailScreen.test.tsx` shows both, and Drop and
      Swap stay offered on a D/Sick shift.
- [x] **Step 5 - Home card.** `MyScheduleCard` adds an absence pill after
      the day's shift pills and includes the absence in the day's spoken
      label.
      _Done when:_ `MyScheduleCard.test.tsx` shows the pill last and the
      accessibility label naming it.
- [x] **Step 6 - Simulator qualification.** On the iOS simulator (and the
      Android emulator if one is available), with a published D/Sick and a
      D/E/Sick cell on the local stack: Schedule tab (Your Week, hero, team),
      shift detail and Home, light and dark, at default and large text.
      _Done when:_ screenshots show the absence last on each, chip labels
      stay on one line, no red-box errors, and the local data is restored.

## Step 6 evidence

iPhone 17 Pro simulator (iOS 26.5), worktree Metro on :8083 and web API on
:3004, 2026-10-21, signed in as QA Management with a published E/Sick
(Oct 22) and E/Office/Sick (Oct 23) in Calm Haven, removed afterwards.

- **Your Week:** the absence row ("Absence", the Sick pill, "Rest of the
  day") follows the shift rows on both days; hours read 50.5h, unchanged.
- **Team list:** "You" shows the Sick pill under Evening Shift.
- **Shift detail:** the shifts, then "Rest of the day: Sick", then the
  split-shift notice; Drop is still offered. Built that way after a first
  pass put the row below the notice.
- **Dark and extra-extra-large text:** pills stay on one line; on the team
  row the pill moves under the name.
- **Not covered on device:** the admin Home card (this account is not an
  admin; its tests cover it) and Android (no emulator running).
- **Harness note:** a worktree Metro whose env points the API at
  `localhost` hangs on the native splash with no request made, for dev's
  own code too; pointing both URLs at the Mac's LAN address works.

## Files / areas

- `packages/contracts/src/schedule.ts` (+ tests)
- `apps/web/src/features/mobile/server/data.ts` (+ `data.test.ts`)
- `apps/mobile/src/features/schedule/lib/scheduleScreenChips.ts`,
  `lib/schedule.ts` (+ tests)
- `apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx`,
  `ShiftDetailScreen.tsx`, `lib/shiftDetailHelpers.ts` (+ tests)
- `apps/mobile/src/features/dashboard/components/MyScheduleCard.tsx` (+ test)

## Testing

- Unit and component tests per step (Vitest + Testing Library, the mobile
  harness), each failing on the code before it.
- Rebuild packages after changing `contracts` exports.
- Step 6 is the device gate (iOS simulator; Android when available).
- Gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`.

## Notes for the AI

- Say "absence", never "off day"; code says `restOfDay`.
- Never turn the absence into a segment.
- Never override `fontWeight` on a mobile text token; chip labels are
  `fit="compact"`, one line.
- Absences stay solid on mobile (owner, 2026-10-20, in the absence-stripes
  fix); the web stripes do not apply here.
- Work in `.claude/worktrees/45d-mobile`; simulators by UDID, Metro on
  :8082 for a worktree.

## Completion notes (2026-10-21)

- **Change descriptions moved to 46d.** 46a's shared change model already
  describes a rest-of-day absence, so "What changed" and "Was" lines are
  left to 46d rather than patched here.
- **Shift detail order:** shifts, time, focus area, the absence, then the
  split-shift notice (the device check caught the absence below the notice).
- **Gates** (worktree, rebased on dev 5b1388dd): type-check, lint (0 errors),
  `test:mobile` 1,494 passed, build, `docs:check` (the mobile schedule guide
  names the absence; four fingerprints re-recorded). `test:web` 5,965 of
  5,968: the 3 failures are live-database tests (`org-isolation`, two 082
  publish cases) that fail on another session's migration 084
  (`staff_schedule_visibility`, 46f) applied to the shared local database
  ahead of dev: "permission denied for table schedule_publish_changes" and a
  missing `get_publish_history`. This branch changes no SQL.
