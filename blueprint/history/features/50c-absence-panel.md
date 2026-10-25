# Feature: The panel records whether someone left early or arrived late

**From build-plan:** feature 50c
**Status:** complete
**Completed:** 2026-10-25
**Type:** Feature

## Goal

The edit panel says which part of a shift an absence covers. Beside a shift,
an absence is either **Left early** (a "Left at" time, the absence covers the
rest) or **Arrived late** (an "Arrives at" time, the absence covers the start).
The panel works out what that means for the cell: the shift the time falls in
is cut there, a later (or earlier) shift that wasn't worked at all comes off,
and the absence's own start and end (stored since 50b) are sent with the save.
A time at the very start of a left-early shift (or the very end of an
arrived-late one) means none of it was worked, and the panel offers to make
the absence a whole-day one. A day bar under the cards shows the worked time
and the absence in time order.

## Design reference

The "Absence beside a shift" canvas
(<https://claude.ai/artifact/9nZXQZhWYybGo33LXqeoH1>): boards Left early,
Arrived late, Two shifts left during the first, and What can't be saved.

## In scope

- A pure planner (`absence-span.ts`) that turns the scheduled shifts, the side
  and the time into the kept shifts, the cut, the removed shifts, the
  absence's start and end, or a problem.
- In the panel's absence card: the Left early / Arrived late choice, the
  Left at / Arrives at field (50a's Worked until field moves here from the
  shift card), and a "Covers ..., No hours." line.
- An arrived-late absence's card sits above the shifts; a left-early one
  below.
- The panel sends the absence's times in its draft, and the confirm saves a
  change to them through the full save, so an arrived-late absence is never
  refilled by the server as a left-early one.
- Removed and restored shifts while the time moves inside one panel session;
  removing the absence restores the shifts and times it changed.
- Never started: "Make it <absence> for the whole day" turns the cell into a
  whole-day absence.
- The day bar: worked segments and the absence, labels in bar order (worked
  hours, absence name), tick times under it.

## Out of scope

- The grid, print, phone Day view, Month, dashboards and person page (50d).
- The footer's unsaved-changes summary, Before and After, alerts, activity
  log, publish history, reports, CSV and calendar (50e). The footer keeps its
  current wording until then.
- Mobile (50f); requests, availability and paste (50g).
- Renaming `restOfDay` code names.

## Data / contracts

- `planAbsenceSpan({ shifts, side, at, extendTo })`, in
  `apps/web/src/components/absence-span.ts`:
  - `shifts`: scheduled `{ start, end }` (`HH:MM`) in time order.
  - `side`: `"left-early" | "arrived-late"`.
  - `at`: the Left at / Arrives at time, or null.
  - `extendTo`: optional far edge of a stored absence that reaches past the
    current shifts (a later shift that came off in an earlier session).
  - Returns `{ problem, cutIndex, keptIndexes, removedIndexes, absence }`,
    `problem` one of `"unset" | "no-time-covered" | "never-started" |
"outside-shift" | null`, and `absence` `{ start, end }` when there is no
    problem.
- Rules (minutes along the day from the first shift's start; an overnight
  shift crosses midnight):
  - Left early: at the first start is `never-started`; at the last end
    `no-time-covered`; past it `outside-shift`. Inside a shift that shift
    ends at the time and every later shift comes off; the absence runs from
    the time to the last end (or `extendTo`). On or between shift edges, the
    earlier shifts are kept whole and the absence starts at the next shift's
    start.
  - Arrived late is the mirror: at the last end `never-started`, at the first
    start `no-time-covered`; the shift the time falls in starts there, earlier
    shifts come off, and the absence runs from the first start (or
    `extendTo`) to the time.
- Side of a stored absence: arrived late when it ends at or before the first
  shift's effective start; otherwise left early (an untimed one too).
- New panel props: `currentRestOfDayAbsenceStartTime` /
  `currentRestOfDayAbsenceEndTime`. `buildPanelInput` adds
  `absenceStartTime` / `absenceEndTime` to a worked input with an absence.

## Build loop

Build one step at a time. The owner asked for 50c to 50g to run without
stopping (2026-10-25), so each step is checked against its done-when and the
loop moves on without waiting for approval.

## Build steps

- [x] **Step 1 - The planner.** `absence-span.ts` with `planAbsenceSpan`
      and `absenceSideOf`.
      _Done when:_ unit tests cover left early inside one shift, inside the
      first of two (the second comes off, the absence runs to its end), on
      the boundary between two, never started, the last end, outside, unset,
      an overnight shift, `extendTo`, and the arrived-late mirror of each;
      and the side of a stored absence.
- [x] **Step 2 - The panel uses it.** The absence card gets the side choice,
      the Left at / Arrives at field and the Covers line; the field leaves the
      shift card; the card moves above the shifts for arrived late; the draft
      carries the plan (kept shifts, cut times, the absence's times) and the
      session's base shifts so a removed shift comes back when the time moves;
      Save is blocked on any problem; removing the absence restores the base;
      the never-started button makes a whole-day absence. The page passes the
      stored times and saves a change to them through `upsertShift`.
      _Done when:_ `ShiftEditPanel.test.tsx` shows Left at cutting the shift
      and sending the times; Arrived late moving the card above and sending
      07:00 to 11:00; two shifts left during the first removing the second
      and sending 13:00 to 23:00, then moving the time into the second and
      getting it back; each problem's message with Save blocked; the
      whole-day button; removal restoring both shifts. A page-level test (or
      the confirm's existing test) shows an absence-times-only change saved
      through the full save.
- [x] **Step 3 - The day bar.** Under the cards, worked segments and the
      absence in time order with their labels and ticks, read as one image
      label ("Worked 7:00 AM to 11:00 AM, Sick 11:00 AM to 3:00 PM").
      _Done when:_ a test reads the bar's label for left early, arrived late
      and two shifts; it is hidden while there is a problem.
- [x] **Step 4 - Browser check and gates.** In the worktree dev server, on
      local Calm Haven as the QA super admin, save a left-early and an
      arrived-late absence and a two-shift case, and see the stored times
      reload in the panel. `npm run type-check`, `npm run lint`, `npm test`,
      `npm run docs:check` pass; the build runs from the main checkout after
      the squash.

## Files / areas

- `apps/web/src/components/absence-span.ts` (+ test)
- `apps/web/src/components/ShiftEditPanel.tsx` (+ test),
  `PillTimeEditor.tsx` (`WorkedUntilField` label)
- `apps/web/src/components/AbsenceDayBar.tsx` (+ test)
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` (props, confirm)

## Testing

- Unit tests for the planner and the day bar; component tests for the panel.
- Browser evidence for the saves, since the panel is the first screen that
  sends the times.

## Notes for the AI

- The absence and person names come from the absence type and the employee
  (first name). Shift names read "the Day shift" in a sentence.
- Times 12-hour with tabular numerals; no em dashes in copy.
- The server refuses overlap and an empty span (422 `ABSENCE_TIMES`); the
  panel checks that the absence covers scheduled time, which the server
  can't once a shift comes off.
- Work in a worktree; relink `@dubgrid` per entry and build packages there.

## Completion notes (2026-10-25)

- **Planner:** `absence-span.ts` plans the cell (`planAbsenceSpan`,
  `planAbsenceCell`), rebuilds the session's base from a stored cell
  (`absenceBaseFromCell`: the cut edge goes back to its scheduled time, and a
  stored span past the shifts is kept as `extendTo`), and reads a stored
  absence's side (`absenceSideOf`). 23 unit tests.
- **Panel:** the absence card has Left early / Arrived late (`SpanTabs`), the
  Left at / Arrives at field (50a's field, now labelled), the Covers line or
  the problem, a notice for each shift taken off, the never-started button and
  the day bar. An arrived-late card sits above the shifts. The panel session
  keeps the shifts as they were, so a shift taken off returns when the time
  moves or the absence is removed; any other change to the shifts starts a new
  session from the cell. A shift's own time editor beside an absence moves the
  absence's time when it edits the cut edge. Add another shift is hidden beside
  a left-early absence (nobody works on after leaving). Every draft the panel
  writes carries the absence's span; a plain worked input still omits it.
- **Save:** the confirm sends a cell with an absence whose times or span
  changed through the full save, so the times-only route never refills an
  arrived-late span as left early.
- **Evidence:** 130 tests across the planner, the day bar and the panel (left
  early, arrived late, reopening on its side, two shifts with the second taken
  off and brought back, removal restoring both, never started to a whole-day
  absence, each problem, overnight, a stored span past the shifts). Type-check
  and lint pass. Browser (worktree dev server, local Calm Haven, QA super
  admin): Richard Bennett's Wed 10/28 Day shift (7:00 AM - 3:30 PM), Sick at
  11:00 AM saved as 07:00-11:00 with the absence 11:00-15:30; reopened on Left
  early, switched to Arrived late and saved as 11:00-15:30 with the absence
  07:00-11:00, read back from the database; no console errors; the draft was
  discarded afterwards.
- **Not here:** the footer's Before and After still says "Sick (rest of day)"
  and the grid still draws "S from 11"; those are 50e and 50d.
