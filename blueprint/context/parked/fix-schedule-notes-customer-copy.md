# Fix: Customers see "Schedule notes", not "Indicators"

**Type:** Fix
**Status:** verified - awaiting `/complete` (parked; another session's fix
holds `current-feature.md`)

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

## Open question for the owner

`canEditNotes` is still labelled "Edit notes", and both it and "Edit schedule
notes" (`canEditScheduleIndicators`) are required to add a schedule note, so the
two labels now read almost alike in the permissions editor. The Schedule
module's description says "Edit shifts and schedule notes". Renaming or
merging the "Edit notes" label is left for the owner.
