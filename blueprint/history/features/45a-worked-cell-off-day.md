# Feature: A worked cell can carry an off day (data model)

**From build-plan:** feature 45a
**Status:** verified
**Completed:** 2026-10-20

## Goal

Let one schedule cell hold up to two worked shifts plus one off day (an
absence type) for the rest of the day, such as D/Bereavement or D/E/Sick, and
carry it intact through saving, drafts, publishing, publish history and
schedule import. This step is storage only: nothing in the editor creates a
mixed cell until 45b, and every reader not updated here keeps showing the
worked part.

## In scope

- The database stores an off day on a worked cell and keeps it through every
  write, publish, sync and import path.
- Shared read paths expose it through one accessor.
- The contract and the schedule manage route accept and store a mixed cell.

## Out of scope

- The editor, grid, taller row and publish-diff badges (45b).
- Month, phone Day, print, dashboard, person page, coverage, reports, export
  and calendar (45c). Until then they show only the worked part.
- The mobile app (45d).
- Shift requests, open-shift staffing and swaps (45e).
- An off day on a repeating shift or series: refused for now.
- Dragging a mixed cell: `move_shift` still refuses worked segments with an
  absence; 45b handles it, and no mixed cell exists before then.

## Data / contracts (load-bearing)

- **The off day lives on the worked cell.** A `worked` cell may have a
  non-null `absenceTypeId`. On a worked cell it means "off for the rest of
  the day" and always reads after the worked segments. An `absence` cell
  still means a whole-day off day and still has no segments or times. A
  `deleted` cell is unchanged.
- **At most two worked segments plus one off day.** The off day has no times;
  `customStartTime`/`customEndTime` stay one entry per worked segment.
- **Two accessors, two meanings.** `getScheduleEntryAbsenceTypeId` keeps
  returning only a whole-day absence, so its existing callers stay correct. A
  new `getScheduleEntryOffDayAbsenceTypeId` returns the off day on a worked
  cell. Later sub-features read the off day only through it.
- **On the web the off day has its own field.** The grid's snapshots and
  flat entries use `absenceTypeId` to mean a whole-day absence, and several
  readers test it without the kind. So a web `ScheduleCellSnapshot` keeps
  `absenceTypeId` for whole-day absences only and carries the off day in
  `offDayAbsenceTypeId`; `scheduleCellSnapshotToInput` maps it back into the
  state's `absenceTypeId`, so re-saving a mixed cell keeps it. A published
  shift entry carries it as `offDayAbsenceTypeId` too, and adds no hours.
- **Publish change rows** already have `from_absence_type_id` and
  `to_absence_type_id`; for a worked cell they now record its off day.
- **Migration number:** 082. 081 belongs to the QA-accounts fix, built in
  parallel; whichever merges second checks the numbering.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

## Build steps

- [x] **Step 1 - The database keeps an off day on a worked cell.** A forward
      migration relaxes the `schedule_cell_snapshots` `valid_state` check so a
      worked snapshot may have an `absence_type_id` (an absence snapshot still
      may not have segments or custom times). It replaces
      `resolve_schedule_state_storage`, `build_schedule_cell_state_json`,
      `write_schedule_cell_snapshot`, `write_schedule_cell_snapshot_internal`
      and `get_schedule_cell_snapshot_payload` (latest bodies: 002 and 032),
      so a worked state keeps its absence type instead of erroring or nulling
      it. Lock the checksum.
      _Done when:_ a live integration test saves a worked draft with an off
      day and reads it back with both; a whole-day absence and a plain
      worked cell are unchanged; an absence with segments is still refused;
      `npm run db:migrations:check` passes.
- [x] **Step 2 - Publishing and import keep it.** The same migration replaces
      `publish_schedule` (latest body 039) so adding, changing or removing an
      off day on a worked cell is a change, not a no-op, and its change row
      records the off day on both sides; and `import_previous_schedule` copies
      it.
      _Done when:_ the integration test publishes a mixed draft, reads the
      published snapshot and the change row with the off day, publishes an
      off-day-only change as one change, and imports a mixed cell into an
      empty week intact.
- [x] **Step 3 - Read paths expose it.** Add
      `getScheduleEntryOffDayAbsenceTypeId` in `schedule-core`. Keep the off
      day on worked cells in `buildStateFromSnapshot`
      (`packages/data-access/src/mobile.ts`), the web mappers
      (`lib/db/mappers.ts`, `lib/schedule-cells.ts`) and
      `resolvePublishedScheduleEntry` (`lib/published-shifts.ts`), whose
      worked hours stay those of the worked segments.
      _Done when:_ unit tests show a mixed snapshot mapped with its segments,
      times and off day; the new accessor returns it; the old accessor still
      returns null for it; and published hours equal the worked segments'.
- [x] **Step 4 - The contract and the manage route accept it.** Relax
      `scheduleCellStateSchema` so a worked cell may carry `absenceTypeId`, and
      keep the off day through the schedule manage route's normalization and
      storage (`api/schedule/manage/route.ts`). Repeating shifts and series
      refuse a worked state with an off day for now, since the relaxed
      database check would otherwise let one through.
      _Done when:_ contract tests accept a worked cell with an off day and
      still reject an absence with segments; a route test saves a mixed cell
      and reads it back unchanged, and refuses one on a series; `npm run type-check`, `npm run lint`,
      `npm run test` and `npm run build` pass.

## Evidence

- Live integration test `worked-cell-off-day.integration.test.ts` (8 cases):
  a worked draft keeps its off day; plain worked and whole-day absences are
  unchanged; an absence with segments is still refused; the resolver accepts
  an off day and refuses another organization's; publishing records the off
  day in the published snapshot and the change row; an off day added to a
  published shift is one change; import copies a mixed cell. Probes with the
  pre-082 bodies restored in a rolled-back transaction showed the old state
  builder and import dropping the off day.
- `publish_schedule` and `get_schedule_cell_snapshot_payload` needed no
  change: they already copy the stored absence type.
- Unit and route tests for the contract, the off-day accessor, data-access,
  the web mappers, published entries and the manage and recurring routes;
  the route tests fail on the previous routes.
- Built in parallel with the QA-accounts fix (081) on the owner's call, then
  moved onto `dev` once 081 landed; 081 redefines none of the functions 082
  replaces. `npm run db:migrations:check` reports 82 contiguous files.
- Not observable on screen until 45b.

## Files / areas

- `supabase/migrations/082_worked_cell_off_day.sql`, `checksums.sha256`
- `packages/contracts/src/schedule.ts` (+ test)
- `packages/schedule-core/src/entry-accessors.ts` (+ test)
- `packages/data-access/src/mobile.ts`
- `apps/web/src/lib/db/mappers.ts`, `apps/web/src/lib/schedule-cells.ts`,
  `apps/web/src/lib/published-shifts.ts`
- `apps/web/src/app/api/schedule/manage/route.ts` (+ test)
- a new live integration test beside the schedule integration tests

## Testing

- Logic tests: the contract, the accessor, the mappers and published-hours
  resolution (unit); the migration's write, publish and import paths (live
  integration, with the integration-test lock and a unique fixture date).
- Rehearse the migration on a throwaway stack (`npm run
db:migrations:rehearse`) before the release that carries it, and apply it
  to production before that release PR merges.
- No UI evidence: nothing on screen changes in 45a.

## Notes for the AI

- Write a new forward migration; never edit an applied one. Copy each
  function's latest body and change only the absence handling, and review
  each one as a diff against that previous body, not as new code.
- Old readers branch on `kind`, so a mixed cell must stay `kind: "worked"`.
  Do not add a new kind.
- Coverage, overlap checks and hours keep using the worked segments only.
- Rebuild packages after changing `contracts` or `schedule-core` exports.
- Risk to check in step 4: any client that parses responses with the old
  contract (an older web tab, a mobile dev build) rejects a mixed cell. No
  editor creates one before 45b, and no mobile build is released.
