# Fix: Schedule notes leave with their shift on every path

**Type:** Fix
**Status:** verified

## The problem

Since `063`, a schedule note belongs to one shift of its cell (`schedule_notes.shift_id`, `job_id`).

- **What clears notes today:** only the manage route's `upsertShift`, through `clearScheduleNotesForRemovedShifts` in `apps/web/src/app/api/schedule/manage/route.ts`. It clears the notes of shifts a single-cell save removed.
- **What doesn't:** two other paths rewrite shifts on cells that can already carry notes, and leave the lost shift's notes behind:
  - series "edit all" (`update_series_all_shifts`)
  - request approvals: swap, pickup and call-off, including auto-approve (`030`) and the scheduler-staffed call-off finalization
- **Already safe:**
  - Recurring fills (`cellBlocksRecurringFill`, `route.ts:772`) and import previous (`target_has_data`) skip any cell that has a draft or published shift. They only ever fill empty cells, which carry no notes.
  - A series delete already clears its cells' notes in the route.
- **The effect:** an orphaned note has no shift to sit under. It still shows as a cell-level dot on the grid and under "For the whole day" on mobile, and it can never be turned off from the editor, because no card owns it.
- **Where the writes go:** all of these reach the schedule through `schedule_cell_snapshots`.
  - `sync_schedule_cell_snapshot` (`002`) upserts the snapshot, then deletes and re-inserts its segments.
  - Publish and discard delete or rewrite snapshots directly.
  - An emptied cell is pruned, and its snapshots and segments cascade away with it.

## The fix

Migration `064_schedule_notes_leave_with_their_shift.sql`: one database mechanism that covers both gaps and any path added later, rather than a clearing call in each of the several request-approval functions.

- **The function:** `clear_schedule_notes_of_lost_shifts(org_id, emp_id, date)`, `SECURITY DEFINER`, not granted to `authenticated`.
  - Reads the cell's effective snapshot: the draft if one exists, else the published one.
  - The kept shifts are that snapshot's segments when it is worked, and none otherwise.
  - A note naming a shift that isn't kept is cleared by the rule the app already uses: a `draft` row is deleted, and a `published` row becomes `draft_deleted`, so the next publish finalises it and a discard restores it.
  - Rows already `draft_deleted` are left alone.
  - Notes that no shift claims (`job_id` null) are untouched.
- **The triggers:** two deferred constraint triggers call it.
  - On `schedule_cell_snapshots`, after insert, update or delete, for the row's cell.
  - On `schedule_cells`, after delete, for the old `emp_id` and `date`.
  - Both are `DEFERRABLE INITIALLY DEFERRED`, so they run once the transaction has finished rewriting a cell and see its final shifts. The delete-then-insert of segments inside one sync never looks like a removal.
- **Why this suits publish and discard:**
  - Publish promotes draft notes and makes the draft the published snapshot in the same transaction. The shifts are still there afterwards, so nothing is cleared.
  - A discard restores the published snapshot and its notes, and those shifts exist again.
- **The app:** remove `clearScheduleNotesForRemovedShifts` and its call in `upsertShift`. The trigger now does this on commit, for this path too. The editor's client-side mirror (`dropNotesOfRemovedShifts`) stays: it keeps local state right without a refetch.
- **Must not break:**
  - the `015`/`063` rule that a note needs a worked shift that the cell has
  - publish and discard of note drafts
  - `clearScheduleNotesForCells` for deletes, moves and pastes
  - realtime (`schedule_notes` is already in the publication)
  - RLS, since the function runs as definer
- **Release:** `064` ships in the same production release as `063`, applied right after it.
- **Also fixed here:** CI on `dev` has failed since `deff2c09`. CI seeds a fresh database in which Calm Haven has no note types, and `schedule-notes-per-shift.integration.test.ts` read one from the seed. Both notes integration tests now create their own note types inside their rolled-back transaction.

## Build steps

- [x] **1. Migration 064 and its proof.**
  - The function, the two deferred triggers, the checksum, and an integration test.
  - The test replays `063` then `064` inside a rolled-back transaction. As in `schedule-notes-per-shift.integration.test.ts`, it takes the table locks first and uses its own fixture date.
  - _Done when:_ `npm run db:migrations:check` passes, and the integration test proves each of these:
    - `update_series_all_shifts`, or a direct `sync_schedule_cell_snapshot` that drops the Evening shift, deletes Evening's draft note and marks its published note `draft_deleted`, while Day's note and a note no shift claims stay
    - a publish of a double shift keeps both shifts' notes
    - discarding drafts restores a note the draft had cleared
    - pruning the cell clears its shift notes
  - All integration files also pass together in parallel.
- [x] **2. One mechanism.**
  - Remove `clearScheduleNotesForRemovedShifts` from the manage route and move its route test to the trigger.
  - Apply `064` to the local database.
  - _Done when:_ type-check and the full test suite pass. In the browser, removing one shift of a double shift through the editor still removes only that shift's note (now by the trigger), and a series edit that drops a shift removes its notes.

## Verify

- `npm run type-check`, `npm run test`, `npm run db:migrations:check`
- **Browser, as `qa-super-admin@dubgrid.test`:** give a person a Day and Evening double shift with Readings on Evening. Remove Evening through the editor, and separately through a series edit. Readings goes both times; a Day note stays.
- **Release:** `064` rehearsed on the scratch stack with `063`, and applied to production right after `063`.

## Evidence

- **Tests:** full `npm run test` green on the branch (web 596 files / 5143 tests, mobile 166 files / 1396 tests, every package); `npm run type-check` passes; `npm run db:migrations:check` passes. After rebasing onto `dev` (`f8a07cd3`, mobile only): `npm run type-check` passes and `npm run build` compiles.
- **Migration test:** `schedule-notes-leave-with-shift.integration.test.ts` drives the real `sync_schedule_cell_snapshot`, `publish_schedule`, `discard_schedule_drafts` and a cell delete inside a rolled-back transaction (3/3); all three fail without `064`. Every integration file passed together in parallel, three rounds of 132 tests.
- **Series edit:** `create_shift_series` then `update_series_all_shifts` dropping Evening, run as `qa-super-admin@dubgrid.test` in a rolled-back transaction: Evening's notes left on both dates, Day's stayed.
- **Browser** (worktree dev server, `qa-super-admin@dubgrid.test`, a seeded Day and Evening draft with Readings on both for Laura Marshall on 2026-10-04, since removed): removing Evening in the editor left only Day's Readings row, by the trigger alone; the grid showed "D" with one dot.
- **Not run:** a swap, pickup or call-off approval end to end; they rewrite the cell through the same `sync_schedule_cell_snapshot` the test drives.
- **Local database:** `064` applied to the shared local database on 2026-09-28.

## Release order

`063` and `064` ship to production together, applied right before the release PR from `dev` to `main` merges: production's current code upserts on the unique key `063` removes. `064` is additive and follows `063` in the same run.
