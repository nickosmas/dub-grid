# Feature: The absence stores its own start and end

**From build-plan:** feature 50b
**Status:** verified
**Completed:** 2026-10-25

## Goal

An absence beside a shift keeps the time it covers as data: its own start
and end, saved, published, imported, moved and handed through requests with
the cell. Today the time is implied ("from the last shift's end to the end
of the day"), which can't say "arrived late", can't keep the Evening shift's
time once that shift comes off, and can't be checked by the server. 50b is
storage and read paths only; nothing on screen changes until 50c and 50d.

## Design reference

None on screen. The "Absence beside a shift" canvas
(<https://claude.ai/artifact/9nZXQZhWYybGo33LXqeoH1>) shows what the stored
times will drive: "Sick 11:00 AM - 3:00 PM", "PTO 7:00 AM - 11:00 AM",
"Sick 1:00 PM - 11:00 PM" after the Evening shift comes off.

## In scope

- Two columns on `schedule_cell_snapshots` for the absence's start and end,
  a constraint, and a backfill of existing rest-of-day absences.
- The save path keeps them, fills them when a client sends none, and
  refuses an absence that covers no time or overlaps a worked shift.
- Publish, import, drag (`move_shift`) and the shift-request functions carry
  them unchanged; a change to them alone is a publish change.
- The contract, the manage route, the shared accessor and every mapper that
  reads a worked cell's absence expose them.

## Out of scope

- The panel's Left early / Arrived late choice and sending the times (50c).
  Until then the panel sends no times and the server fills them.
- Drawing the times anywhere: grid, print, Month, dashboards (50d); change
  records, alerts, reports, CSV and calendar (50e); mobile (50f).
- The availability rule and paste (50g).
- Renaming the `restOfDay` code names. They stay through 50b; the rename is
  a decision for when the display work lands.
- Checking that the absence covers scheduled time. The server no longer
  knows what was scheduled once a shift comes off (the canvas's two-shift
  case), so that check stays in the panel (50a, 50c).

## Data / contracts (load-bearing)

- **Columns:** `schedule_cell_snapshots.absence_start_time TEXT` and
  `absence_end_time TEXT`, `HH:MM`, like `custom_start_time`. One absence
  per cell, so no pipe joining.
- **Constraint** `schedule_cell_snapshots_absence_times`: both null or both
  set; set only on a `worked` row with an `absence_type_id`; start and end
  differ. An end at or before the start crosses midnight, as shift times do.
- **Meaning:** the absence covers start to end on the cell's date, crossing
  into the next day when end is at or before start. It never overlaps a
  worked shift's effective time (`resolve_work_assignment_time_ranges`).
- **Backfill (draft and published rows):** each worked row with an absence
  and no times gets start = the last shift's effective end and end = that
  shift's default end, when the two differ. Rows where they match (a
  full-shift absence saved before 50a) stay null.
- **Null times on a worked cell with an absence** mean a legacy row:
  readers treat it as before ("rest of the day", from the last shift's
  end). Only the backfill's leftovers and old publish-change JSON have it.
- **State JSON** (`build_schedule_cell_state_json`, so drafts, published
  state and publish change rows): adds `absenceStartTime` and
  `absenceEndTime` on a worked state with an absence.
- **Contract:** `scheduleCellStateSchema`'s worked state gains optional
  `absenceStartTime` and `absenceEndTime` (`HH:MM` strings or null), only
  with `absenceTypeId`.
- **Accessor:** `getScheduleEntryRestOfDayAbsenceTimes(entry)` in
  `schedule-core` returns `{ start, end } | null`. Web entries gain
  `restOfDayAbsenceStartTime` / `restOfDayAbsenceEndTime` and their
  `published...` pair beside `restOfDayAbsenceTypeId`.
- **Write rule (server):** a save of a worked cell with an absence and no
  times fills them as the backfill does; a fill or sent times that cover no
  time, or overlap a worked shift, are refused (`check_violation`). Publish,
  import, `move_shift` and the request functions copy stored values without
  re-checking, so a legacy row still moves.
- **Migration number:** 092. Check `supabase/migrations/` for another
  session's 092 before writing it.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Columns, constraint and backfill (migration 092, part
      1).** Add the columns and constraint, then backfill draft and
      published rows. Lock the checksum.
      _Done when:_ a live integration test finds a D/Sick row worked until
      11:00 AM backfilled to 11:00 - 15:00, a D/E/Sick row backfilled from
      E's effective end, a full-shift D/Sick row left null, and the
      constraint refusing times on a whole-day absence, one time without
      the other, and equal times; `npm run db:migrations:check` passes.
- [x] **Step 2 - Saving keeps, fills and checks the times (092, part 2).**
      Restate `resolve_schedule_state_storage`,
      `build_schedule_cell_state_json`, `write_schedule_cell_snapshot`,
      `write_schedule_cell_snapshot_internal` (latest bodies in 082) and
      `get_schedule_cell_snapshot_payload` (032) so a worked state's
      `absenceStartTime` / `absenceEndTime` are stored, returned and built
      into the state JSON, filled when missing, and refused when empty or
      overlapping. New arguments go last with `DEFAULT NULL`, and the old
      signature is dropped in the same migration, so the nine later
      functions that call these keep working unchanged (they pass no times,
      which a save fills and the JSON leaves out until step 3).
      _Done when:_ live tests save a worked cell with sent times and read
      them back; save one with none and find them filled; are refused for
      times overlapping the shift, equal times, and a fill that covers
      nothing; and a plain worked cell and a whole-day absence are
      unchanged.
- [x] **Step 3 - Publish, import, drag, undo and requests carry them (092,
      part 3).** Restate `publish_schedule_unguarded` (latest body 087) so a
      times-only change publishes as one change and both sides of its
      change row hold the times; and have `import_previous_schedule` (082),
      `move_shift` (083), `discard_schedule_cell_draft_internal` (086),
      `resolve_shift_request_unchecked`, `claim_shift_request_unguarded` and
      `shift_request_published_cells` (088), and `create_shift_request_unguarded`
      and `volunteer_for_open_shift_unguarded` (085) pass the stored times
      wherever they read or write a worked cell with an absence. The series
      functions (042, 080, 090) still refuse an absence and need no change.
      _Done when:_ live tests publish a mixed cell and read the times from
      the published row and change row, publish a times-only change as one
      change, import and move a mixed cell intact, and approve a swap of the
      first shift of D/E/Sick that keeps the absence's times on the cell
      left behind; discarding a draft change to the times brings back the
      published times.
- [x] **Step 4 - Contract, accessor and mappers expose them.** Relax
      `scheduleCellStateSchema`, add `getScheduleEntryRestOfDayAbsenceTimes`,
      and carry the times through `packages/data-access/src/mobile.ts`,
      `apps/web/src/lib/db/mappers.ts`, `lib/schedule-cells.ts`
      (`buildScheduleCellEntry`, `scheduleCellSnapshotToInput`),
      `lib/published-shifts.ts`, `lib/realtime-draft-utils.ts` and
      `editor-session.ts`'s draft comparison, so a times-only change is a
      draft change. Rebuild packages.
      _Done when:_ unit tests show the contract accepting times with an
      absence and refusing them without one; the accessor returning times,
      and null for a legacy row; a mixed snapshot mapped with its times on
      web and mobile; and a times-only change marking the cell modified.
- [x] **Step 5 - The manage route keeps them.** The route's normalization,
      saves and drags pass the absence's times through (the page adds them to
      a drag from the source cell, since the grid's drag data carries only the
      absence type), the audit's "before" state records them, and a refusal
      from step 2 answers 422 (`ABSENCE_TIMES`). A times-only save sends no
      absence times, so the server refills them from the new end: kept as they
      were, they would overlap a later Worked until. Until 50c the only
      absences are "left early" ones, which the refill matches; 50c sends
      times explicitly.
      _Done when:_ route tests save a mixed cell with times, show a
      times-only save leaving the times to the server, a drag passing them to
      `move_shift`, and the refusal mapped to 422; `npm run type-check`,
      `npm run lint`, `npm test`, `npm run build`, `npm run docs:check` and
      `npm run db:migrations:rehearse` (092 on a throwaway stack) pass.

## Files / areas

- `supabase/migrations/092_absence_times.sql`, `checksums.sha256`
- `packages/contracts/src/schedule.ts` (+ test)
- `packages/schedule-core/src/entry-accessors.ts` (+ test)
- `packages/data-access/src/mobile.ts`
- `apps/web/src/lib/db/mappers.ts`, `lib/schedule-cells.ts`,
  `lib/published-shifts.ts`, `lib/realtime-draft-utils.ts`,
  `lib/db/shifts.ts`, `app/(app)/schedule/_lib/editor-session.ts`
- `apps/web/src/app/api/schedule/manage/route.ts` (+ test)
- latest bodies to copy: 082 (save path, import), 032 (payload), 087
  (publish), 083 (move), 085, 086 and 088 (requests and undo)
- a new live integration test beside
  `worked-cell-rest-of-day-absence.integration.test.ts`, and the request
  test beside `shift-requests-rest-of-day-absence.integration.test.ts`

## Testing

- Live integration tests for the migration (local database, the
  integration-test lock, unique fixture dates), each case also run against
  the pre-092 bodies in a rolled-back transaction where that proves the
  old code dropped the times.
- Unit tests for the contract, accessor and mappers; route tests for the
  manage route.
- No browser evidence: nothing on screen changes. 50c's browser check is
  the first to show stored times.
- Rehearse 092 with `npm run db:migrations:rehearse` before the release
  that carries it, and apply it to production before that release PR
  merges.

## Notes for the AI

- Forward migration only; copy each function's latest body and change only
  the absence lines, and review each as a diff against that body.
- Adding parameters to a Postgres function makes a new overload, and two
  overloads that both accept a call fail it as "not unique". Add the new
  ones last with defaults and `DROP FUNCTION` the old signature first.
  PL/pgSQL callers resolve at run time, so they pick up the new one; grep
  `supabase/migrations` for each name to find the latest body of every
  caller step 3 restates.
- Times compare on the clock like shift times: crossing midnight is a range
  whose end is at or before its start. Reuse the overlap logic in
  `assert_non_overlapping_work_assignment_times` rather than writing a new
  one.
- Keep `restOfDay` names in code; don't add a new state kind (readers
  branch on `kind`).
- Rebuild packages after changing `contracts` or `schedule-core`.
- Work in your own worktree; relink `@dubgrid` per entry and build packages
  there before running web tests, and run `npm run build` from the main
  checkout after the squash, since Turbopack refuses a worktree's linked
  `node_modules`.

## Completion notes (2026-10-25)

- **Every write lands in `sync_schedule_cell_snapshot`**, so that is where
  the times are kept, filled and checked, behind a `p_require_absence_times`
  flag the editor's save (`write_schedule_cell_snapshot`) sets and
  `move_shift` clears (`p_allow_untimed_absence`), so a full-shift absence
  saved before 50a still drags. The state resolver needed no change: only
  series and request snapshots use it, and those stay segment-only. Undoing
  a draft (086) needed none either: it deletes the draft, so the published
  times come back.
- **Backfill:** the schedulable-employee trigger would refuse a row of
  someone since made inactive, so it is off for the one UPDATE (as 061,
  063 and 068 did), and the deferred notes trigger runs immediately there,
  since its queued events otherwise make the re-ENABLE fail ("pending
  trigger events"), which a dry run caught.
- **Constraint:** the first draft let one time through without the other (a
  CHECK that evaluates to NULL passes); it now requires both explicitly.
  Found by the live test.
- **Grants:** recreated functions take default privileges, which since 016
  include `PUBLIC` (and so `anon`). The two entry points
  (`write_schedule_cell_snapshot`, `move_shift`) are revoked from `PUBLIC`
  and `anon` and granted to `authenticated`; `sync`, the payload, the
  internal write, the state-JSON builder and the two helpers are revoked
  from callers entirely. Found by `org-isolation.integration.test.ts`; the
  082 test now calls the builder as the owner.
- **Times-only save:** sends no absence times, so the server refills them
  from the new end (kept as they were, they would overlap a later Worked
  until). The absence's times stay out of `shiftEditableIdentityMatches`,
  like every other time, but count in the draft-kind check.
- **Evidence:** `absence-times.integration.test.ts` (9 live cases: fill,
  constraint, sent and filled times, refusals, plain and whole-day cells,
  publish and a times-only publish, import, drag with and without times);
  a request case keeping 8:00 to 11:00 PM through a hand-over, which no
  fill could produce; the 082 test saving untimed; unit tests for the
  contract, accessor, web and mobile mappers and draft kind; 4 route tests
  (save, times-only refill, drag, 422). Type-check, lint (0 errors),
  `npm test`, `docs:check` and `db:migrations:check` pass, and
  `db:migrations:rehearse` from 091 passed with evidence in
  `internal/operations/migration-rehearsals/2026-10-25-091-to-092.md`. The
  production build runs from the main checkout after the squash.
- **Docs:** no page text changed. The generated inventory gained 092, and
  pages citing the changed schedule sources were re-recorded.
- **Before release:** apply 092 to production before the release PR that
  carries it merges.
