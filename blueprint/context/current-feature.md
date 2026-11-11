# Current Feature

## Import staff that matches Add staff members

**Type:** Fix
**Status:** in progress
**Design reference:** the "Import staff" canvas,
https://claude.ai/artifact/Bd8UcxZ9wUnmceyhe3Hqd4 (approved by the owner,
2026-11-11). Web only, desktop-sized
screens as today; the mobile app has no import.

## The problem

The People page's **Import** (`components/staff/BulkImportModal.tsx`,
`app/api/import/employees/route.ts`) has fallen behind **Add staff members**
(`components/AddEmployeeModal.tsx`, `features/employees/server/insert-employees.ts`)
in what it saves and in how it looks.

What it saves:

- The route has its own insert, seniority and batch code instead of the shared
  `insertEmployees`, so it misses that function's checks and records.
- A schedule area isn't required. Add staff refuses a person without one
  (`requireFocusArea: true`); an imported person can arrive with none and so
  never shows under On Schedule.
- One audit row for the whole import (`resource_id: null`, no names) and no
  `employee_created` event, so imported people are missing from the activity
  log and their own timeline. Add staff writes one row and one event per person.
- No employment type, first day (51g4) or invite with an access role. Everyone
  imported must be invited one at a time afterwards.
- Names and emails skip the shared `@dubgrid/contracts` checks and
  normalization (`getStaffNameError`, `normalizeStaffName`,
  `getOptionalStaffEmailError`).
- A Gridmaster's import doesn't need an impersonation of the organization (one
  of the routes F-201 lists).
- Smaller: an error hard-codes "schedule area" instead of the organization's
  term; `.CSV` in upper case is refused; a quoted line break inside a field
  splits the row; a certification must be its full name, not its abbreviation.

The People **Export** (`app/api/export/route.ts`, staff) is behind too (owner,
2026-11-11, "fix people export too"): it heads columns "Focus Areas" and
"Roles" instead of the organization's terms, writes raw `inactive` and
`removed` instead of Away and Offboarded (and never Suspended), leaves out
employment and first day, lets a spreadsheet run a cell starting with `=` as a
formula, and has no byte-order mark, so Excel garbles accented names.

How it looks:

- Its own `createPortal` dialog with inline styles throughout, not the shared
  `Modal`.
- The preview shows only the first 20 rows, so a blocked row after that is
  never shown; a row's reason is an icon whose words appear only on hover;
  blocked and similar rows are tinted red and yellow.
- An icon in the primary button and a Title Case label ("Import 3 Employees").
- An all-caps "EXPECTED CSV FORMAT" heading over a sample table, and no template
  to download.
- The result lists at most 10 errors.

## The fix

**One path for adding people.** The import resolves each row on the server and
adds the clean rows through `insertEmployees`, so both entry points share the
reference, schedule-area and first-day checks, seniority, the per-person audit
row and the `employee_created` event. Rows that fail stay per-row errors; the
rest are added.

**The same fields as Add staff.** The file gains `employment` (`full-time` or
`part-time`, default full-time) and `first_day` (`YYYY-MM-DD`, today up to a year
ahead). `focus_areas` becomes required. In the dialog, **Invite everyone with an
email** and, for a Super Admin or Gridmaster, **Set everyone to** an access role
work as in Add staff; invites go out through the same `sendNewStaffInvites` and
step-up path after the people are added. Access roles stay out of the file.

**One column set for both directions.** The export writes the import's
columns first, in the organization's words (First Name, Last Name, Email,
Phone, its schedule area, certification and role labels, Employment, First
Day, Notes), then Status (Away until Jan 4, Suspended, Offboarded) and
Seniority, which the import ignores. A cell starting with `=`, `+`, `-` or
`@` is written with a leading apostrophe and read back without it, and the
file starts with a byte-order mark.

**One dialog in the current style**, on `Modal` with steps (`onBack`), no inline
styles, tokens only:

| Step          | Shows                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose a file | A drop zone, **Download template** (columns plus two example rows using this organization's own schedule area, certification and role names), and one line on what's required                                   |
| Check         | Every row, scrolling, each with its status in words: Ready, Similar to (name), or the reason it won't be added. A segmented **All / Ready / Won't be added** filter with counts. Invite options under the list. |
| Done          | How many were added and invited, and every row that wasn't, with its reason                                                                                                                                     |

The primary button reads **Add 12 people** or **Add 12 & invite 9**, sentence
case, no icon, as Add staff's does. Fixing a row means fixing the file and
choosing it again; rows aren't edited in the dialog.

Must not break:

- The `csv_import` flag still disables the button and the route.
- Duplicate checks against everyone in the organization in any status, and
  against other rows in the file (`lib/employee-duplicate-detection`).
- A file of up to 500 rows and 2 MB. The route sends `insertEmployees` at most
  `MAX_EMPLOYEE_BATCH` (100) at a time.
- Files exported from People import again: the export's headers (`First Name`,
  `Focus Areas`, ...) already normalize to the import's, and `Status`,
  `Seniority` and other unknown columns are ignored.
- The effective (sandbox-aware) organization id, CSRF and rate limiting.
- Labels come from the organization's terms, never default English.

## Build steps

- [x] **0. Prototype.** A Design canvas with the three steps at 1280px, in light
      and dark, including a file with a duplicate, a similar name, an unknown
      schedule area and a bad first day, and the Done step with failures.
      **Done when:** the owner approves it.
- [x] **1. File parsing and row checks.** A pure module
      (`features/employees/staff-import.ts`) that parses the CSV (quoted commas
      and line breaks, a byte-order mark, any `.csv` case), maps header aliases,
      builds the template from the organization's names, and checks each row:
      names and email through `@dubgrid/contracts`, a schedule area, employment,
      first day through `isValidFirstDay`, and areas, certification (name or
      abbreviation) and roles against the organization. The modal and the route
      both use it, replacing `import-reference-validation.ts` and the modal's
      parser.
      **Done when:** its tests cover each rule and an exported People file, and
      `npm run type-check` passes.
- [x] **2. The route adds through `insertEmployees`, and the export
      writes the same columns.** Resolve and check each row
      with step 1's module, send clean rows in batches, return per-row errors in
      the file's numbering and the added people (`id`, `email`) for invites. Set
      `gridmasterNeedsImpersonation`. Drop the bulk audit row and the route's own
      insert code.
      **Done when:** `route.test.ts` covers a mixed file (added, unknown area,
      missing area, bad first day, contact conflict), one audit row and event per
      person, and a Gridmaster without an impersonation refused; the export's
      test covers its columns, statuses and formula guard.
- [ ] **3. The dialog.** Rebuild `BulkImportModal` on `Modal` per the canvas.
      Move `inviteAddedPeople` out of `PeoplePageContent` so Add staff and import
      share it. Remove the old inline styles and tinted rows.
      **Done when:** `MembersSection.test.tsx` passes, and the browser shows each
      step matching the canvas in light and dark, with a real file of 30 rows
      adding and inviting people on the local stack.
- [ ] **4. Docs and checks.** Update "Importing a list" in
      `docs/staff/roster.mdx` (columns, required schedule area, first day,
      invites, template) and refresh its fingerprint. Run `npm run type-check`,
      `npm run lint`, `npm run test:web` and `npm run build`.
      **Done when:** all pass and `npm run docs:check` is clean.

## Verify

1. On People, choose **Import**, then **Download template**: the columns include
   `employment` and `first_day`, and the examples use this organization's names.
2. Choose a file with a duplicate, a similar name, an unknown schedule area, a
   row with no schedule area and a first day two years out: each row says why in
   words, every row is listed, and **Won't be added** shows just those.
3. With **Invite everyone with an email** on, add the file: the people appear
   on People, each person has their own entry in the activity log, the invited
   ones show as invited, and **Done** lists every row that wasn't added.
4. Export People and import that file into another organization with the same
   names: it reads without header errors.
5. As a Gridmaster outside an impersonation, the import is refused.
