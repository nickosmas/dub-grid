# Fix: Schedule notes: per-shift notes, a refined draft dot, and saved drafts that stay on the grid

**Type:** Fix
**Status:** verified

## The problem

Three bugs, reported 2026-09-27 against `dev` at `e2962d4c`.

1. **A note on one shift of a double shift turns on for both.**
   - `schedule_notes` is unique on `(emp_id, date, indicator_type_id, focus_area_id)` (`001_schema.sql:557`). It has no shift identity.
   - A cell's shifts are segments of one snapshot (`schedule_cell_segments`: `shift_id` nullable, `job_id` not null).
   - Two shifts in the same focus area (the report: Evening and Day, both Skilled Nursing) therefore read and write one note row.
   - The panel's per-card toggles are keyed by focus area only: `renderInlineIndicators(shiftWingId)` at `ShiftEditPanel.tsx:3112`, and `draftNotes[focusAreaId]` in `SchedulePageClient.tsx`.
   - The owner chose per-shift notes backed by a forward migration.
2. **The draft note dot looks rough.**
   - `draft_added` in `noteDots.tsx:37` draws a 1.5px dashed white border on a 10px circle.
   - At that size the browser renders four chunky dashes.
3. **A saved draft sometimes vanishes from the grid until a refresh.**
   - `refetchScheduleData` (`SchedulePageClient.tsx:1105`) applies whatever it fetched, with no staleness check.
   - The initial load (`:1255`) and the draft-check fetch (`:2356`) do the same.
   - Any fetch that starts before a save commits and resolves after the save's merge overwrites the saved cell with pre-save data. The grid then shows the old state until something refetches again. The late fetch can come from:
     - the visibility-change refetch
     - the window sync on navigation
     - a peer's debounced `draft_changed` refetch
     - an earlier confirm's background refetch
     - the initial load, when you save straight after a cached paint
   - Optimistic writes through `enqueueShiftWrite` have the same exposure while their request is in flight.

## The fix

### 3. Saved drafts survive a late fetch

- Record which cells this tab changed locally, with a generation counter:
  - bumped when an optimistic change is applied
  - bumped when a write settles
  - bumped when the edit-panel confirm merges
- A fetch notes the generation when it starts. When it resolves, it applies the server result for every cell except these, which keep their current local value (shift and notes):
  - cells touched after the fetch started
  - cells that still have a pending write (`pendingShiftWrites`)
- Nothing is thrown away and nothing waits, so a refetch called from inside a write cannot deadlock.
- The conflict refetch (`handleShiftWriteConflict`) and the edit-panel refetch after a refused write stay unguarded. There the server is meant to win.
- The reconcile is a pure helper in `schedule-window.ts`, with unit tests.

### 2. Draft dot

- Keep the original CSS dots. `draft_added` keeps the note's full colour: the
  full dot inside a 1px dashed outline of that colour, offset 1.5px. The ring
  sits outside the dot's 10px, so two draft dots side by side touch rings; the
  owner chose that over a ring inside the dot. (Also rejected: an SVG dashed
  ring as too much, and a half-opacity dot as losing the colour.)
- The published dot's white border is 1px, not 1.5px.
- A note pending removal (`draft_deleted`) shows no dot at all, on any web
  surface (grid, Month, Day, dashboard, print): `buildScheduleNoteMarks` drops
  it, and the `draft_removed` mark state is deleted.
- Nor does a note removed by the last publish: the owner judged a dot for a
  note that is gone confusing. `published_removed`, its dashed style and the
  name and colour fallbacks it needed are deleted.
- A note added in the last publish is one ring: the note's colour inside a
  green border, with no white border or second outer ring.
- Keep `data-note-dot`, the aria labels and the hint text unchanged.

### 1. Per-shift notes

- **Migration `063_schedule_notes_per_shift.sql`:**
  - Add `shift_id BIGINT NULL` and `job_id BIGINT NULL` to `schedule_notes`. Together they are the segment key; the pair is how a segment is identified, since `shift_id` alone is null for a shiftless job.
  - **Backfill** each existing row against its cell's effective snapshot (draft if one exists, else published):
    - Find the segments in the note's focus area.
    - One match: stamp that segment's key on the row.
    - Several matches: stamp the first and insert a copy for each other segment. What people see today, the note on both shifts, is preserved.
    - No match: leave the key null.
  - **Uniqueness:** replace the unique key with `UNIQUE NULLS NOT DISTINCT (emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id)`.
  - **015 trigger:** add the new columns to its `UPDATE OF` list.
  - **Housekeeping:**
    - lock the checksum
    - `npm run db:migrations:check`
    - add the columns to the hand-written `DbScheduleNote` in `packages/db-types`
- **Null key:** a row with a null key is a note not tied to a shift, and keeps today's cell and focus-area behaviour everywhere. New writes on a worked cell always carry the segment key.
- **Server** (`api/schedule/manage/route.ts`):
  - `upsertScheduleNote` and `deleteScheduleNote` take an optional `shiftId`/`jobId`, and upsert on the new key.
  - `upsertShift` clears notes whose segment key is no longer in the new snapshot. Removing one shift of a double shift then drops its notes, closing a known gap.
  - The legacy duplicates in `lib/db/schedule.ts:266,302` have no callers. Delete them rather than port them.
- **Publish record and contracts:**
  - `NotePublishChangeState` and `fetchPendingNotePublishChanges` carry the segment key.
  - The mobile note row and `mobileScheduleIndicatorSchema` gain optional `shiftId`/`jobId`.
- **Web schedule page:**
  - `ScheduleNoteMap` entries carry `shiftId`/`jobId`.
  - The edit session (`collectCellNotesSnapshot`, `baseNotes`/`draftNotes`, the fingerprint) is keyed by focus area plus segment key.
  - The commit loop writes with the segment key.
  - `ShiftEditPanel`'s multi-shift cards and single-shift view pass their own segment to the toggles, so each card's toggles are independent.
  - Grid, Month and Day dots stay cell-level. They union the cell's notes and dedupe by indicator and state, as today; no dot per pill in this fix.
- **Dashboard and mobile:**
  - `dashboardScheduleNotes.ts` and mobile's `scheduleNotesForSegment` assign a note to the segment whose key matches.
  - A null-key note falls back to today's focus-area matching.
- **Unchanged:** print, reports and Gridmaster person activity. They list notes per day and focus area, and a duplicate indicator on two shifts collapses as today.
- **Must not break:**
  - Notes on a single-shift cell, which behave exactly as before.
  - Publish and discard of note drafts. Those functions filter by status and date, not by the key.
  - The rule that clearing a cell's shift clears its notes.
  - RLS: the new columns need no policy change.

## Build steps

- [x] **1. Late fetches keep local saves.**
  - Add the reconcile helper and its tests.
  - Track touched cells and generations in `SchedulePageClient`.
  - Route `refetchScheduleData`, the initial load and the draft-check fetch through the helper.
  - _Done when:_ unit tests prove a fetch that started before a local write keeps the written cell and takes every other cell from the server, and that a fetch started after the write takes the server value. Type-check and the schedule page tests pass.
- [x] **2. Refined note dots.**
  - `draft_added` becomes the full dot inside a dashed outline in `noteDots.tsx`; pending removals show no dot; update the note-dot tests.
  - _Done when:_ a screenshot shows the draft dot on light and dark cells at 100% and 110% zoom. Tests pass.
- [x] **3. Migration 063.**
  - Columns, backfill, new unique key, trigger `UPDATE OF` and segment check, checksum, db-types.
  - _Done when:_ `npm run db:migrations:check` passes. An integration test runs 063 from its file inside a rolled-back transaction (the shared local database is not migrated until merge) and proves:
    - a double-shift cell's note backfills onto both segments
    - two rows differing only by segment coexist
    - a duplicate on the full key is refused
- [x] **4. Server writes, clearing and publish record.**
  - Manage route note upsert/delete with the segment key.
  - Clear removed segments' notes in `upsertShift`.
  - Publish-change and mobile row carry the key.
  - Delete the dead `lib/db/schedule.ts` note writers.
  - _Done when:_ route tests show a note written for one segment leaves the other untouched, and removing one shift of two drops only its notes. Existing note route tests pass.
- [x] **5. Schedule page and panel per shift.**
  - Note map, edit session, commit loop, fingerprint, and the panel's toggles by segment.
  - _Done when:_ a `ShiftEditPanel` test proves toggling a note on one card of a double shift in one focus area leaves the other card off. In the browser, saving that change shows the note on the correct shift after a reload.
- [x] **6. Dashboard and mobile by segment.**
  - `dashboardScheduleNotes.ts` and mobile `scheduleNotes.ts` match on the segment key with the null-key fallback.
  - _Done when:_ unit tests for both assign a keyed note only to its segment and a null-key note by focus area. Mobile and web tests pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test`, `npm run db:migrations:check`
- **Browser, as `qa-super-admin@dubgrid.test`:**
  1. Give a person Day and Evening shifts in one focus area.
  2. Open the cell and turn on Readings for Evening only, then save. Only Evening shows Readings; Day stays off.
  3. Reload. The same holds.
  4. Publish, and confirm the publish summary lists the one note.
- **Late-fetch race:** save a draft, switch tabs for more than 10 seconds and back (the visibility refetch), then navigate a period and back. The saved draft never disappears.
- **Draft dot:** zoom into a draft-added dot at 100% and 110%, in light and dark. It keeps the note's colour with a fine dashed ring.
- **Mobile:** the person's shift detail shows Readings under Evening only.

## Evidence

- **Tests and build:** after rebasing onto `dev` (`ed924400`): `npm run type-check` passes, full `npm run test` is green (web 595 files / 5137 tests, mobile 165 files / 1394 tests, every package), and `npm run build` compiles (Turbopack, run from the worktree with hard-linked `node_modules`).
- **Migration:** `npm run db:migrations:check` passes; `schedule-notes-per-shift.integration.test.ts` runs 063 inside a rolled-back transaction (backfill onto both shifts, per-shift uniqueness, refused missing shift, the route's six-column upsert). 063 applied to the shared local database on 2026-09-27 at the owner's choice.
- **Browser** (worktree dev server, `qa-super-admin@dubgrid.test`, a seeded Day and Evening Skilled Nursing draft for Laura Marshall on 2026-10-04, since removed): Readings on Evening only saved one row on shift 35, survived a reload with one draft dot and Day still off; Readings on both shifts gave two rows and one grid dot; removing Day left only Evening's note. No console errors.
- **Dots:** chosen through rendered previews of the exact styles on Day, Evening and dark cells at 1x, 1.1x and 3x.
- **Not run:** a native simulator check of mobile shift detail; the mobile grouping is covered by unit tests.

## Release order

063 adds the columns the app now selects and upserts on, so it must be applied to production before this code ships (the usual migrate-before-merging-the-release-PR rule). Additive for readers; the backfill copies a note shared by a double shift onto each shift, so nothing visible changes.
