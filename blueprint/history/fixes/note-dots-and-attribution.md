# Fix: Schedule note marks on their own shift as coloured sticky notes, every note attributed and tied to a shift

**Type:** Fix
**Status:** verified

## The problem

Reported 2026-09-28 against production (release #121, `063` and `064` applied):

1. **Dots too big.** `NOTE_DOT_SIZE` is 10px (`schedule-grid/badges.tsx:39`). The owner wants them tiny, just visible.
2. **On a double shift, dots sit in the cell corner, not on their own shift.** The grid builds one `noteMarks` list per cell (`ScheduleGrid.tsx:1925`, `noteMarksForKey(emp, date, focusArea)`) and draws it once below the pills (`ScheduleGrid.tsx:3335`). Since `063` every note knows its shift, but the grid doesn't use it.
3. **Several notes on one shift overlap.** The draft dot's dashed ring is an `outline` offset 1.5px outside the 10px box. At the 2px `NOTE_DOT_GAP`, neighbouring rings collide (the owner's screenshot shows two draft dots overlapping).
4. **Notes can still exist without a shift.** `063` left `shift_id`/`job_id` nullable for notes no shift claimed, and the editor, dashboard and mobile carry fallbacks for them (the editor's "no shift" slot, the dashboard's focus-area fallback, mobile's "For the whole day" group). The owner's rule: a note cannot exist without a shift. Read-only check 2026-09-28: production and local both have no such note.
5. **Many notes crowd a shift.** A shift with three or more notes draws three or more dots.
6. **Drafts show as "Unattributed drafts" in the publish dialog.**
   - The manage route writes `schedule_notes` with the service client.
   - `set_audit_fields` (`002`) stamps `created_by`/`updated_by` only when `auth.uid()` is set, which it never is for the service client, and the route passes no author.
   - Every note in production has null authors (read-only check 2026-09-28: 7 drafts, 3 published).
   - **The same gap breaks discard.** "Discard my drafts" (`/api/shifts/discard`, `scope: "mine"`) calls `discard_schedule_drafts` with the caller's ID. The function deletes draft notes and restores pending removals only `WHERE updated_by = p_user_id`. With every author null, no note matches, nothing is discarded, and the route still answers success. The owner saw exactly that.
   - The audit log still records each save (`schedule_note.upserted`, `actor_id`, `resource_id = emp_date`, `details.indicatorTypeId`). All 10 production notes have a matching row.

## The fix

### Attribution

- The manage route sets the author explicitly on every note write, from the verified actor:
  - `upsertScheduleNote`: `created_by` and `updated_by` on insert; `updated_by` on update. The upsert keeps an existing `created_by`.
  - `deleteScheduleNote` (marking `draft_deleted`) and `clearScheduleNotesForCells` (the delete, move and paste paths): `updated_by`.
  - `set_audit_fields` leaves explicit values alone when `auth.uid()` is null, so passing them is enough for a new note. On an existing note, though, the service client's upsert would overwrite `created_by` with the latest editor, and `set_audit_fields` protects it only when `auth.uid()` is set. So `068` adds `trigger_schedule_notes_keep_creator`, which keeps an existing `created_by` on every update.
- `064`'s trigger, when it marks a removed shift's published note `draft_deleted`, runs inside the snapshot write, which goes through the user client, so `auth.uid()` names the editor. A test proves it.
- **Migration `068_schedule_notes_authors_and_shift_required.sql`** (first written as `065`; renumbered 2026-09-28, since `065`, `066` and `067` went to other work):
  - fills `created_by` and `updated_by` on rows where both are null, from the most recent matching `schedule_note.upserted` row in `audit_log` (same org, `resource_id`, indicator type); rows with no match stay null
  - then makes `job_id` `NOT NULL`, since no note may exist without a shift (`shift_id` stays nullable for a shiftless job)
  - no production row violates this, and the code in production already sends a shift with every new note, so `068` can be applied ahead of the code

### A note always belongs to a shift

- The manage route's `shift` becomes required on note upsert and delete.
- The types become non-null throughout: `ScheduleNote.jobId`, `DraftNoteState.jobId`, the note map and the publish record. The mobile contract keeps its fields optional, only so an older app build still parses a response.
- Remove the "no shift" fallbacks:
  - **Editor:** `activeNoteIds` and `toggleDraftNote` stop sharing a shiftless note across cards, and the panel drops its shiftless slot.
  - **Dashboard:** `scheduleNoteMarksBySegment` matches on the shift only.
  - **Mobile:** `scheduleNoteGroups`/`scheduleNotesForSegment` group by shift only; the "For the whole day" group goes.
  - **`064`:** stays as is; its `job_id IS NOT NULL` filter becomes redundant.

### Note marks: coloured sticky notes, one per shift

Decided with the owner 2026-09-28 from previews: dots are replaced by sticky-note icons in the note's colour.

- **One note:** an 11px sticky note (lucide `StickyNote`).
  - Published: filled with the note's colour, outlined in the pill's text colour, which is readable on every shift colour by construction, so a note whose colour matches its shift stays visible.
  - Draft: hollow, drawn in the note's colour; in dark mode that colour is lightened 40% toward white so it shows on dark pills.
  - Added in the last publish: filled, outlined in the publish-diff green.
- **Two or more notes:** one 13px stacked icon, the first note in front and the second behind, each in its own colour and state. No count; the hover text and label list every note.
- The space reserved for the mark (`noteMarksWidth`) is 0, 11 or 13px, and every inset that avoided the dots uses it.
- **Per shift:** on a double shift, each pill draws its own notes at its own corner. A single-shift cell and a deleted shift keep one cell-level mark.
- Month and Day views, print and the dashboard keep their per-note inline icons in the text colour.

### Must not break

- the note-dot states (published, draft added, added in the last publish) and their labels
- print, the dashboard and mobile
- the publish dialog's per-author breakdown
- F-82's Month view merge

## Build steps

- [x] **1. Every note write names its author.** (The two local browser checks run with step 4's browser session.)
  - Route writes set `created_by`/`updated_by`; migration `068` backfills from `audit_log`; checksum.
  - _Done when:_
    - route tests show the actor on upsert, delete and clear
    - an integration test proves `068` fills a null-author note from its audit row and leaves one with no audit row null, and proves `064`'s trigger stamps the editor when run under a user's claims
    - locally, the publish dialog lists a new draft note under "Your drafts"
    - an integration test proves `discard_schedule_drafts` with a user ID deletes that user's draft note and restores their pending removal, leaving another editor's untouched
    - locally, "Discard my drafts" removes a note draft from the grid
- [x] **2. A note always belongs to a shift.**
  - `job_id NOT NULL` in `068`, the required `shift` in the route and types, and the shiftless fallbacks removed from the editor, dashboard and mobile.
  - _Done when:_
    - type-check passes
    - an integration test proves a note without a shift is refused
    - the editor, dashboard and mobile note tests pass without the shiftless cases
- [x] **3. Coloured sticky-note marks, one per shift.**
  - Replaces the dots (10px, then 6px) after owner review: one icon for a note, a stacked icon for several.
  - _Done when:_
    - a screenshot of the real grid at 100% and 110%, light and dark, shows a single published note, a draft, and a stacked mark for several notes
    - grid tests cover the single and stacked marks and their labels, and pass
- [x] **4. Marks on their own shift.**
  - The grid resolves marks per pill on a double shift.
  - _Done when:_
    - a `ScheduleGrid` test shows a double shift with notes on each shift drawing each pill's own dots
    - in the browser, the owner's double-shift case shows each note on its own shift
    - the full suite passes

## Verify

- `npm run type-check`, `npm run test`, `npm run db:migrations:check`
- **Browser, as `qa-super-admin@dubgrid.test`:** on a Day and Evening double shift, put Readings on Day and Shower on Evening. Each shows on its own pill as a sticky note, and a shift with two notes shows the stacked icon. Publish: the dialog lists the notes under "Your drafts".
- **Release:** `068` rehearsed on a scratch stack at production's live ledger (read it first; `067` from other work comes before it, and both need a rehearsal from the ledger), then applied ahead of the code.

## Outcome

- **Checks:** `npm run type-check` passed; `npm run test` passed in full (web 600 files and 5221 tests, mobile 1401, every package); `npm run build` passed; the live tests for 063, 064 and 068 pass. A first full run hit four Postgres deadlocks caused by `gridmaster-fresh-proof.integration.test.ts` altering `employees` and `auth.users` live; each file passed alone and the rerun was green. That suite is flagged for its own fix.
- **Browser (local, `qa-super-admin@dubgrid.test`):** the grid at 100% and 110%, light and dark, showed single, draft and stacked marks. On Kenneth Crawford's Evening and Night double shift, notes added through the shift panel landed on their own pills and were saved with the QA account as author. The publish dialog listed them under "Your drafts", and "Discard my drafts" removed exactly those five drafts, leaving another session's six untouched.
- **Found on the way:** the panel files each note under its shift's own focus area, so a cross-focus pill looked in the wrong place; each pill now looks under its shift's focus area. A single cross-focus shift still looks under the section's focus area (outside this spec, unverified).
- **Migration:** written as `065`, renumbered to `068` because `065`, `066` and `067` went to other work in the meantime. Production must apply `067` then `068`, each rehearsed from the live ledger first, before the release merges.
