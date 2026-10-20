# Fix: Absences are called absences, never off days

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-20

### The problem

DubGrid's data model, Settings page and docs call Sick, Vacation and
Bereavement "absence types", but much of the web app and the docs still call
them "off days". The owner decided on 2026-10-20 that "absence" is the right
word everywhere, which matters more now that item 45 puts an absence beside a
worked shift (D/Bereavement), where "off day" reads wrong.

Where "off day" appears (no organization-customizable label covers it, so it
can change directly):

- **Web copy:** the shift picker's "Off Days" heading and its "Off day
  options" label (`ShiftPicker.tsx`); "Remove off day", the "Remove Off
  Day?" dialog and "Create Repeating Off Day" (`ShiftEditPanel.tsx`); the
  repeating wording in `RepeatForm.tsx` ("Repeating Off Day", "already has a
  shift or off day"); two schedule toasts (`SchedulePageClient.tsx`); the
  Reports column "Published off days" (`features/reports/shared/table.ts`);
  the Absence Types settings description (`settings/AbsenceTypes.tsx`); and
  the series and recurring route errors from 45a.
- **Code names and comments:** 45a's `offDayAbsenceTypeId`,
  `published_off_day_absence_type_id`,
  `getScheduleEntryOffDayAbsenceTypeId` and `seriesHasOffDay`, plus comments
  across web and the packages.
- **Docs:** `schedule-grid.mdx`, `schedule-tools.mdx`,
  `recurring-shifts.mdx`, `reports.mdx` and
  `shifts-jobs-and-absences.mdx`.
- **Plans:** item 45 in `build-plan.md`, `project-plan.md`, the overview,
  and the 45a archive.

The mobile app has none.

### The fix

Say "absence" (or "absences") wherever "off day" means an absence type. 45a's
code names become **rest-of-day absence**: `restOfDayAbsenceTypeId`,
`published_rest_of_day_absence_type_id`,
`getScheduleEntryRestOfDayAbsenceTypeId`, `seriesHasRestOfDayAbsence`. They
stay distinct from the whole-day `absenceTypeId`.

| Before                                             | After                                              |
| -------------------------------------------------- | -------------------------------------------------- |
| Off Days (picker heading)                          | Absences                                           |
| Off day options                                    | Absence options                                    |
| Remove off day                                     | Remove absence                                     |
| Remove Off Day?                                    | Remove Absence?                                    |
| Remove off day "SICK" from …                       | Remove absence "SICK" from …                       |
| Create Repeating Off Day / Repeating Off Day       | Create Repeating Absence / Repeating Absence       |
| … already has a shift or off day                   | … already has a shift or absence                   |
| Creating repeating off day…                        | Creating repeating absence…                        |
| Published off days (report column)                 | Published absences                                 |
| the off-day and calloff labels (Settings)          | the absence and call-off labels                    |
| … can't include an off day for the rest of the day | … can't include an absence for the rest of the day |

It must not break:

- **Behavior:** wording and names only. No logic, data, migration or API
  shape changes; the database column stays `absence_type_id`, and no
  migration is touched.
- **Exports:** the operations report's CSV header changes with its column;
  say so in the archive, since a customer's spreadsheet may match on it.
- **Terminology rules:** "Organization" and the organization-configurable
  labels are untouched; this is fixed product wording.
- **Docs gates:** `npm run docs:check` passes, with each changed page's
  claims re-read and its fingerprint re-recorded.

### Build steps

- [x] **1. Web copy says absence.** Change every string in the table above
      and update the tests that pin them (`ShiftEditPanel.test.tsx`,
      `assignable-shifts.test.tsx`, `reports/server/operations.test.ts`,
      and the 45a route tests).
      _Done when_ those tests pass with the new wording and
      `git grep -niE "off[ -]?days?"` finds no user-facing string in
      `apps/web/src`.
- [x] **2. Code names and comments say absence.** Rename 45a's identifiers
      to `restOfDay…` and reword "off day" comments in web and the
      packages.
      _Done when_ `git grep -niE "off[ -]?days?|offDay|off_day"` in
      `apps/` and `packages/` returns nothing, and type-check passes.
- [x] **3. Docs, plans and history say absence.** Reword the five docs
      pages, re-record their fingerprints, and reword item 45 in the build
      plan, the project plan, the overview and the 45a archive.
      _Done when_ `npm run docs:check` passes and the same grep finds no
      "off day" in `docs/` or those blueprint files.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test`, `npm run build` and
  `npm run docs:check` pass from the worktree.
- In the browser: select an empty cell; the picker's second section is
  "Absences". Pick Sick; the button reads "Remove absence" and its dialog
  "Remove Absence?". Reports > Operations shows "Published absences".

### Evidence

- From the worktree: `npm run type-check` (24 tasks), `npm run lint` (0
  errors), `npm run test` (web 5,868 and mobile 1,487 tests, none failing),
  `npm run build` (91 pages), `npm run docs:check` (34 of 34) and
  `npm run db:migrations:check` passed.
- The tests that pinned the old wording now assert the new copy:
  "Repeating Absence", "Create Repeating Absence", "Absences", "Published
  absences" and the repeat-overwrite messages.
- `git grep -niE "off[ -]?days?|offDay|off_day"` in `apps/` and `packages/`
  finds only two mobile test fixtures that name a sample absence type "Off
  Day", which is an organization's own data, not app wording.
- Fifteen docs pages had their claims re-read and fingerprints re-recorded;
  five changed wording (schedule grid, schedule tools, recurring shifts,
  reports, shifts, jobs and absences).
- The 45a archive and its integration test were renamed to
  `rest-of-day-absence`; migration 082 keeps its file name
  (`082_worked_cell_off_day.sql`), which is locked by checksum.
- The Reports "Published absences" column renames the operations report's
  CSV header too; a customer spreadsheet that matched on "Published off
  days" needs the new name.
- Not checked in a browser: wording only, covered by the component tests.

### Out of scope

- Older archives under `blueprint/history/` other than 45a's: they record
  what was said at the time.
- Renaming the `absence` cell kind or any database object.
