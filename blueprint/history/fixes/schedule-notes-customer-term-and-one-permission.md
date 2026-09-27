# Fix: Customers see "Schedule notes", and one permission edits them

**Type:** Fix
**Status:** verified

## The problem

Owner decision (2026-09-27): customers call what the code names indicators
**schedule notes** (singular "schedule note"). Web still says "Indicators" or
"indicator" in the settings section and its nav item, toasts and empty state,
the permission names and the permissions editor, the reports filter, columns and
metrics, the shift panel's section heading and add/remove labels, the grid's
hover card, both print legends, the Gridmaster configuration tab, the activity
log's record names, and API errors that reach the screen. The reports also call
the same thing "Shift notes", a third term. The published docs name the
permissions "shift indicators" and "indicator types".

Mobile has no indicator copy yet; 42c (parked) adds it as "Schedule notes".

## The fix

Change customer-visible copy only. Every label, heading, legend, permission
name, empty state, toast, tooltip, aria-label, error message and doc sentence
that names the concept says "schedule note(s)" in sentence case.

- **Vocabulary.** An indicator, on a cell or as a settings row, is a "schedule
  note". Where copy must tell the definition apart from notes on cells (the
  permission names, the report's distinct count), it is a "schedule note
  type".
- **Reports.** The "Shift notes" report, its columns and its empty text become
  "Schedule notes"; the `shift-notes` report key stays.
- **Unchanged.** Code identifiers, types, props, routes, URL section ids
  (`staff-indicators`, `?section=indicators`), query keys, `data-*` test hooks,
  and database tables and columns. Generic uses of "indicator" (presence, draft
  and bulk-selection indicators, the iOS home indicator) are a different thing
  and stay. The privacy policy is legal copy and stays.

## Build steps

- [x] **Step 1 - rename the copy** - web components, permission labels, audit
      record names, report labels, API error strings, and the admin-permissions
      doc; update the tests that pin the old text. _Done when:_ a scan of string
      literals and JSX text under `apps/web/src`, `apps/mobile/src` and
      `packages/*/src` finds no customer-facing "indicator" naming this concept,
      and `npm run type-check`, `npm run test:web`, `npm run test:mobile` and
      `npm run lint` pass. _Done 2026-09-27:_ the scan finds only code
      identifiers, query strings and cache keys; type-check, lint (0 errors),
      `test:web` (577 files) and `test:mobile` pass.

- [x] **Step 2 - one permission for schedule notes** - retire
      `canEditScheduleIndicators` into `canEditNotes` (owner decision
      2026-09-27, see "Why two keys" below). - `AdminPermissions`, the `authz` baselines and the editor lose the key;
      `canEditNotes` is labelled "Edit schedule notes". Impersonation strips
      `canEditNotes` where it stripped the retired key, so a Gridmaster still
      sees notes read-only while impersonating (shifts stay editable). - The shift panel's note controls and the manage route's
      upsert/delete checks read `canEditNotes` alone. - The mobile bootstrap still sends `canEditScheduleIndicators`, equal to
      `canEditNotes`, because installed app builds require the field. - `permissionLabel` keeps the retired key's label for history rows, and
      a history line names "Edit schedule notes" once when both keys changed. - Migration `061` removes the key from every stored permission set
      (memberships and management departments); where it was `false`,
      `canEditNotes` becomes `false`, so nobody gains note writing. The
      permission-change trigger is disabled for the rewrite so it logs no
      change nobody made. - Seed, test factories, the admin-permissions doc and the engineering
      docs count 25 permissions. `project-overview.md` is left to
      `/overview` (another session holds uncommitted edits to it).
      _Done when:_ no application code or seed reads the retired key outside
      the mobile wire field and the history label; the migration passes
      `db:migrations:check` and a rolled-back run on the local stack shows the
      three cases (both on, notes on with the retired key off, neither key
      stored); `npm run type-check`, `npm run test:web`, `npm run test:mobile`
      and `npm run lint` pass. _Done 2026-09-27:_ the readiness check passes;
      the migration run inside a rolled-back transaction removed every key,
      turned `canEditNotes` off where the retired key was off, logged no
      permission change and re-enabled the trigger, and a literal-value check
      covered all six shapes (including JSON null); type-check, lint (0
      errors), `test:web` (5015 tests) and `test:mobile` (1385) pass.

## Verify

- Settings > Scheduling lists **Schedule notes**; adding one toasts "Schedule
  note saved"; the empty state reads "No schedule notes yet".
- The permissions editor shows "Edit schedule notes", "View schedule note
  types" and "Manage schedule note types".
- A shift's slideover shows a **Schedule notes** section; its buttons are named
  "Add Float schedule note" / "Remove Float schedule note".
- Hovering a cell with a note shows "Schedule notes: Float"; the printed
  schedule's legend is headed **Schedule notes**.
- Reports: the **Schedule notes** report's filter reads "All schedule notes"
  and its CSV header is `Date,Employee,Schedule note,Focus area`.
- An admin whose Schedule switch is on can add and remove a schedule note in
  the shift panel; with it off the panel lists the notes read-only. A
  Gridmaster impersonating sees them read-only.
- An Activity-log permission change written before 061 names "Edit schedule
  notes" once.

## Why two keys

March 2026: `schedule_notes` had two fixed kinds (`readings`, `shower`) and
`canEditNotes` gated writing them. When the kinds became configurable
(`indicator_types`), `74d8f4f46` (2026-05-18) added `canEditScheduleIndicators`
beside it instead of replacing it. Since then row security checks one, the
shift panel the other and the API both, and the permissions editor always
toggles them together, so neither does anything alone.

## Release order

Apply `061` to production before the release that ships step 2. Old code on
migrated data resolves the missing key to its admin default (`true`), so its
effective note access equals the rewritten `canEditNotes`. New code on
unmigrated data would let a permission set with `canEditNotes` on and the
retired key off (only possible when written outside the editor) write notes.

Release: migration 061 applied to production 2026-09-27 by the owner, ahead of
the release that carries step 2, after a scratch rehearsal from 060 and on the
local stack. Before: 60 ledger entries, only 061 missing; latest backup
2026-09-26 13:40:45 UTC. After: 61 ledger entries, none missing, every
invariant passing, health 200.
