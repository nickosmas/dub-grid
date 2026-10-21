# Feature: The web editor and grid show a worked shift plus an absence

**From build-plan:** feature 45b
**Status:** verified

## Goal

A manager can add an absence for the rest of the day beside one or two
shifts in the web shift panel (D/Bereavement, D/E/Sick), record when the last
shift actually ended, and see the cell on the Week and 2 Weeks grid as the
approved mockup draws it: the absence pill last, side by side when every
pill has room, stacked otherwise in a row that grows only as far as it
needs. Drafts, publishing, the publish badges, copy, paste and drag keep
every part. 45a stored the shape; 45b makes it usable on the web grid.

## Design reference

The approved mockup (owner, 2026-10-20):
<https://claude.ai/artifact/VdE4TYfvinYyQN6f62vrHr>

- **Week view (Main):** D/BRV sits side by side (two pills fit); D/E/Sick
  stacks, and only its row grows.
- **2 Weeks, light and dark:** narrow columns stack every mixed cell.
- **Panel:** shift cards, then the absence card last ("Sick", "Rest of the
  day, from 7:00 PM"), a "Worked until" field on the last shift, and "Add
  another shift" beside "Add an absence".
- **Print:** belongs to 45c.

## In scope

- The panel: add, show and remove a rest-of-day absence; "Worked until".
- The grid: the absence pill, layout and row height, labels for hover and
  screen readers, and publish-diff badges.
- Everything on the web grid path that drops or misreads the absence:
  draft detection, the times-only save, drag (migration 083), copy, undo,
  realtime diffs.
- Readers of publish change rows that would show a published mixed cell as a
  whole-day absence (the grid's publish badges, Publish History, and the web
  dashboard's schedule rows).

## Out of scope

- Month view, the phone Day view, print, the person page, coverage tallies,
  reports, CSV export and the calendar feed (45c).
- The mobile app (45d).
- Shift requests and open-shift staffing (45e).
- A rest-of-day absence on a repeating shift or series: still refused; the
  panel hides the control there.

## Data / contracts (load-bearing)

- **Entry fields:** `buildScheduleCellEntry` adds top-level
  `restOfDayAbsenceTypeId` and `publishedRestOfDayAbsenceTypeId` to a web
  schedule entry (`ShiftMap` value), read from the effective and published
  snapshots. `absenceTypeId` and `publishedAbsenceTypeId` stay whole-day
  only, and the entry `label` stays the worked segments only, so splitting it
  on "/" still lines up with segments.
- **Order:** the absence always draws last, after the worked shifts.
- **Times:** the absence has no times. "Worked until" is the last worked
  segment's custom end time; its start fills from the segment's custom or
  default start, since the time editor saves both.
- **Publish change rows:** `from_absence_type_id`/`to_absence_type_id` hold a
  worked cell's rest-of-day absence too (082). Readers decide whole-day from
  the row's `fromState`/`toState` kind, never from those ids alone.
- **Migration 083:** replaces `move_shift` (latest body in 002) so a worked
  move keeps its absence type. Nothing else changes in the database.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

## Build steps

- [x] **Step 1 - Every save path keeps the absence.** Add the two entry
      fields in `buildScheduleCellEntry`. `shiftEditableIdentityMatches` and
      `computeScheduleEntryDraftKind` (`editor-session.ts`) and
      `lib/realtime-draft-utils.ts` compare it, so adding or removing one is a
      draft change. The manage route's `upsertShiftTimes` passes the stored
      absence type instead of `null`. `lib/db/shifts.ts` stops nulling it.
      `setShift` and `buildDraftShiftFromInput` (`SchedulePageClient.tsx`)
      refuse an archived or unknown rest-of-day absence type, as they already
      do for a whole-day one.
      _Done when:_ unit tests show an absence-only change marks the cell
      modified and is not a no-op, and a route test shows a times-only save
      keeps the absence type.
- [x] **Step 2 - Publish rows never read as a whole-day absence.**
      `toPublishChanges`, the one mapper every publish-change reader uses,
      splits each row's absence by the state kind: `fromAbsenceTypeId` and
      `toAbsenceTypeId` stay whole-day only, and a worked cell's absence goes
      to `fromRestOfDayAbsenceTypeId`/`toRestOfDayAbsenceTypeId`. So
      `ScheduleGrid.tsx`, `cellChangeBadges.ts`, `PublishHistoryPanel.tsx`,
      `MyScheduleRow.tsx` and `UserDashboard.tsx` read correctly without
      their own checks (built that way in place of a per-reader helper).
      _Done when:_ tests feed a published D/Sick change row to each reader
      and none treats it as a whole-day absence; a whole-day change reads as
      before.
- [x] **Step 3 - Drag keeps the absence (migration 083).** Replace
      `move_shift` so a worked move writes its absence type; the grid's drag
      payload carries the rest-of-day id. Lock the checksum.
      _Done when:_ a live integration test moves and copies a D/Sick cell
      and finds both parts at the target; `npm run db:migrations:check`
      passes.
- [x] **Step 4 - The grid draws the absence pill.** In `ScheduleGrid.tsx`
      the absence counts as one more pill, drawn last with its absence-type
      colours and label (code or name mode), and with "from <time>" when the
      last shift has a custom end. The pill count feeds `isDoubleShiftCell`,
      `stacksShifts`, the grid template and the row height
      (`doubleShiftCellHeight`), so the mockup's side-by-side and stacked
      cases follow. The cell's hover entries and `aria-label` name it.
      _Done when:_ `ScheduleGrid.test.tsx` shows D/Sick side by side in a
      wide column, D/E/Sick stacked with a taller row, the absence pill last
      with its colours, and the aria label naming all three.
- [x] **Step 5 - Publish-diff badges see the absence.** `ShiftDiffState`
      gains `restOfDayAbsenceTypeId`; the absence pill gets its own new,
      removed or edited badge, and `publishCellLevelBadge` gets the full pill
      count. `countShiftsAddedToPublishedCell` requires the absence to match,
      so adding one beside a published shift is an edit, not a new shift.
      _Done when:_ tests show adding, removing and changing a rest-of-day
      absence each badge the absence pill only, and the banner counts each
      as one edit.
- [x] **Step 6 - The panel adds and removes the absence.** New props carry
      the current and initial rest-of-day absence. "Add an absence" sits
      beside "Add another shift" (two equal buttons) and opens the absence
      list; picking one keeps the shifts. The absence card draws last with a
      remove button that clears only it; "Remove all shifts" clears it too;
      Undo restores it; the footer summary names it. `buildPanelInput` and
      every caller pass it through. The absence card has no schedule notes
      or mentored toggle. "Add an absence" hides once there is one, "Add
      another shift" once there are two shifts; adding a shift beside D/Sick
      gives D/E/Sick with the absence still last. Hidden on a repeating series
      outside "this shift", and "Repeat" is unavailable on a mixed cell, with
      a reason, since the server refuses it.
      _Done when:_ `ShiftEditPanel.test.tsx` covers add, remove, remove-all,
      undo, the summary, adding a second shift beside an absence, and the
      blocked Repeat, and shows the shifts kept when an absence is added.
- [x] **Step 7 - "Worked until".** With an absence present, the last shift's
      card shows a "Worked until" time field that sets that segment's custom
      end (and fills its start), with "Hours count to <time>. The absence
      covers the rest." below it, as in the mockup.
      _Done when:_ tests show the pipe-joined custom times change only the
      last segment's end, for one and two shifts.
- [x] **Step 8 - Browser qualification.** On the local grid (worktree dev
      server), Week and 2 Weeks, light and dark: create D/BRV and D/E/Sick in
      the panel, record "worked until", publish, drag one to another day,
      and remove the absence.
      _Done when:_ screenshots match the mockup's cases, no console errors,
      and a measurement script finds no pill overlapping another or leaving
      its cell.

## Files / areas

- `apps/web/src/lib/schedule-cells.ts`, `app/(app)/schedule/_lib/editor-session.ts`,
  `lib/realtime-draft-utils.ts`, `lib/db/shifts.ts`, `lib/draft-utils.ts`,
  `lib/shift-diff-badges.ts`
- `apps/web/src/app/api/schedule/manage/route.ts`
- `apps/web/src/components/ScheduleGrid.tsx`, `schedule-grid/gridHelpers.ts`,
  `schedule-grid/cellChangeBadges.ts`, `PublishHistoryPanel.tsx`,
  `dashboard/MyScheduleRow.tsx`, `dashboard/UserDashboard.tsx`
- `apps/web/src/components/ShiftEditPanel.tsx`, `ShiftPicker.tsx`,
  `app/(app)/schedule/SchedulePageClient.tsx`
- `supabase/migrations/083_move_shift_keeps_absence.sql`, `checksums.sha256`
- Tests beside each, plus a live integration test for 083.

## Testing

- Unit and component tests per step (Vitest + Testing Library), each failing
  on the code before it where it fixes a drop or misread.
- A live integration test for 083 (local database, integration-test lock,
  unique fixture dates).
- Step 8 is the browser gate (Playwright or the browser pane), against the
  mockup.
- Gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- Say "absence", never "off day"; code says `restOfDay` (owner, 2026-10-20).
- Organization labels come from terminology settings; absence names and
  codes come from the absence types.
- Peer action buttons are equal-width, labels never wrap; the panel's
  footer and dialogs follow the existing panel patterns.
- Rehearse 083 with `npm run db:migrations:rehearse` before the release that
  carries it; apply it (with 081 and 082) to production before that release
  PR merges.
- Work in your own worktree; the shared local database is used by other
  sessions, and a QA sign-in outside Calm Haven moves the QA profile's
  organization (restore it after browser checks).

## Completion notes (2026-10-21)

- **Drag sent only the first shift's custom time.** Found in step 8: the
  grid's drag payload used the first pill's time, so a second shift's
  custom time (and its "Worked until") was lost on a move. This predates
  45b. `joinedCustomTimes` (`gridHelpers.ts`) now sends every shift's time,
  and the live move kept `|15:30` / `|19:00`.
- **Docs:** the Schedule Grid page gained one bullet on adding an absence
  and "Worked until", with its manifest claim. Thirteen other pages had
  their evidence fingerprints re-recorded; their claims did not change.
- **Typography contract:** the absence pill's "from <time>" line copies the
  shift pill's dimmed time line beside it, so `ScheduleGrid.tsx`'s
  documented dimmed-text count went from 7 to 8.
- **Evidence:** type-check, lint (0 errors), `test:web` 5,909 passed,
  `test:mobile` passed, build, `docs:check`, `db:migrations:check`. Browser
  check on the local grid, Week and 2 Weeks, light and dark: D/Bereavement
  side by side in Week, D/E/Sick stacked with only its row taller; publish
  and drag kept every part in the database; no pill overlapped another or
  left its cell (931 and 462 cells measured); no console errors. Local
  Calm Haven data and its unstarted trial were restored afterwards.
- **Before release:** rehearse 081 to 083 with `npm run
db:migrations:rehearse` and apply them to production before the release
  PR merges.
