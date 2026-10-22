# Feature: What changed

**From build-plan:** feature 47b (parent 47, Staffing check)
**Status:** verified
**Branch:** `feature/47b-what-changed` (cut from `dev` at 978d1c4a)

## Goal

Coverage Check (47a) says a cell went from 3/5 to 2/5. 47b says why: the
cell detail lists each person whose draft change moved that cell's count,
in plain words ("Richard Bennett's Day Shift · Supervisor moved to Sat,
Oct 24", "Dana Crawford was given an absence (Sick) instead of Day Shift").
Every line is measured from the same per-person credit the coverage engine
counts, so the lines always add up to the cell's change, and a cell nothing
touched says so (owner: insights must never mislead, 2026-10-21).

## Design reference

- The "Staffing check panel" canvas,
  https://claude.ai/artifact/KSPPPawq4W1E89ZUJNdmAT: the cell detail's
  **What changed** list (a small dot per line) below Still needed, and the
  one-line unchanged text when nothing changed.
- Where the canvas and the data differ, the data wins:
  - The canvas's "Open shift staffed by ..." and "(approved time off)" are
    not knowable from a draft: staffing an open shift is an ordinary draft
    add, and approvals publish directly (owner, 2026-10-21), so they never
    appear as draft changes. Both read as the plain add or removal.
  - Counts can be fractional, so a mentoring change gets its own line.

## In scope

- `@dubgrid/schedule-core`: per-person contributions on coverage snapshots
  (opt-in), the per-cell difference between draft and published
  contributions on the matrix, and a pure sentence builder for those
  differences.
- The schedule page builds each person's draft and published day for the
  sentence builder from the same `shifts` map the grid reads.
- The panel's cell detail: What changed for editors, or the unchanged line.
- The public guide's Coverage Check section.

## Out of scope

- Suggestions, Ways to fix and Not suggested (47c, 47d).
- Marking count-neutral swaps (one person off, another on, same count) in
  the Changes since publish view: 47a's marks and comparison counts stay
  about counts. The detail still lists both people.
- Who made a draft change (the grid's author name already shows it).
- Mobile, the dashboard and reports.

## Build steps

- [x] **Step 1 - Per-person contributions** - in
      `packages/schedule-core/src/coverage.ts`, `CoverageComputationInput`
      gains `includeContributors?: boolean`; when set, each snapshot carries
      `contributors: CoverageContributor[]` (`{ employeeId, assignmentId,
credit }`), recorded inside the existing count loop: the same employees,
      the same eligible codes, the same max-credit rule, nothing recounted.
      `buildCoverageMatrix` reads them into each cell's
      `contributorChanges: CoverageContributorChange[]` (`{ employeeId,
publishedAssignmentId, draftAssignmentId, publishedCredit, draftCredit
}`), only on published dates, one entry per person whose credit differs
      (beyond float noise). Without contributors on both sides the list is
      empty, so callers that do not opt in are unchanged.
      _Done when:_ unit tests show contributors match `actual` (their
      credits sum to it) for both requirement models; a removed, an added, a
      swapped (count unchanged, two entries) and a mentoring-only change; an
      unpublished date with no entries; and, for every cell in a randomized
      fixture, the sum of `draftCredit - publishedCredit` equals
      `draft.actual - published.actual`. Existing coverage and matrix tests
      still pass.
- [x] **Step 2 - Sentences** - a new
      `packages/schedule-core/src/coverage-change-text.ts` exports
      `describeCoverageCellChanges(input)`: given a cell's
      `contributorChanges`, its row's focus area and date, and lookups (a
      person's name, an assignment's full name and home focus area, a focus
      area's and an absence type's name, a person's draft and published day
      on any loaded date as `{ assignmentIds, absenceTypeId }`, the loaded
      date keys, and a date formatter), it returns one line per change,
      losses first, then gains, each by name, worded as in **Change lines**
      below. It also exports `coverageCellUnchangedText(cell)`: "Not published
      yet, so there is nothing to compare." on a date never published;
      "Already short when published. Nothing in this draft changed it." for
      a short cell; otherwise "Nothing in this draft changed it."
      _Done when:_ a unit test per row of the table, plus ordering, a move
      outside the loaded dates (reads "was taken off"), a move with two
      candidate dates (the nearest wins), a move between focus areas (both
      lines name the other area), a day with two assignments, two people in
      one cell, an unknown person, an archived assignment and absence
      (still named), mentored credit shown exactly, and each unchanged
      text.

- [x] **Step 3 - What changed in the cell detail** - the page builds the
      matrix with `includeContributors` and gives the panel a
      `describeCellChanges(row, cell)` that calls the step 2 builder with
      lookups over `shifts` (draft: `assignmentIds` and `absenceTypeId`,
      empty when `isDelete`; published: `publishedAssignmentDefinitionIds`
      and `publishedAbsenceTypeId`), `assignmentNameMap`, the focus areas,
      absence types and employee display names. For editors the detail
      shows **What changed** with one line per change, or the unchanged
      line; people who cannot edit shifts get neither.
      _Done when:_ `CoveragePanel.test.tsx` shows the list for a changed
      cell, each unchanged text, nothing for a non-editor, and the lines
      in order; type-check and lint pass.
- [x] **Step 4 - Public guide** - the Coverage Check section of
      `docs/features/coverage-and-open-shifts.mdx` adds What changed to the
      cell detail list.
      _Done when:_ `npm run docs:check` and `npm run docs:verify` pass with
      the changed pages' fingerprints re-recorded.
- [x] **Step 5 - Browser qualification** - on local Calm Haven as
      `qa-super-admin`, with temporary coverage requirements and draft
      edits covering every line in the step 2 table (removed and restored
      afterwards), 2 Weeks at 1440px, light and dark.
      _Done when:_ every case reads as the table says on the cells it
      touches, both cells of a move name each other's date, for every
      changed cell the listed credits add up to After minus Before, an
      untouched cell shows its unchanged text, and `qa-admin` without shift
      editing sees no What changed.

## Change lines

| Case (first match wins)                                       | Line                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| Lost; the same assignment is new in the draft on another date | "{Name}'s {Shift} moved to {Sat, Oct 24}"                 |
| Lost; the draft day holds work it did not have when published | "{Name}'s {Shift} changed to {Other}"                     |
| Lost; the draft day is an absence                             | "{Name} was given an absence ({Sick}) instead of {Shift}" |
| Lost; still on the shift, less credit                         | "{Name} is now mentored on {Shift}, counting {0.5}"       |
| Lost; otherwise                                               | "{Name} was taken off {Shift}"                            |
| Gained; the same assignment left another date in the draft    | "{Name}'s {Shift} moved here from {Wed, Oct 28}"          |
| Gained; the published day held work the draft dropped         | "{Name} changed from {Other} to {Shift}"                  |
| Gained; the published day was an absence                      | "{Name}'s absence ({Sick}) was replaced with {Shift}"     |
| Gained; already on the shift, more credit                     | "{Name} is no longer mentored on {Shift}, counting {1}"   |
| Gained; otherwise                                             | "{Name} was scheduled for {Shift}"                        |

- **{Other}** names only the work that changed (added in the draft for a
  loss, dropped from it for a gain), joined with "and", each
  followed by " in {Focus area}" when its home focus area is not the row's,
  so a move between focus areas never reads "Day Shift to Day Shift".
- **A move** looks at every loaded date, names the nearest one (the earlier
  on a tie), and the two cells of a move name each other's date.
- **A person no longer listed** reads "Someone"; an archived assignment or
  absence keeps its name.
- Work kept on both sides is never named as a change: taking one shift off
  a double shift reads "taken off", and adding a shift beside kept work
  reads "scheduled for" (found while planning step 5, 2026-10-22).
- Credit shows up to two decimals.

## Qualification evidence (2026-10-22)

Local Calm Haven as `qa-super-admin`, 2 Weeks at 1440px, light and dark,
with six temporary requirements, mentored credit set to 50% and ten draft
changes, all removed afterwards (no draft rows left, credit back to 100%):

| Cell                  | Before to After | What changed                                                                                                           |
| --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Day Shift, Mon 26     | 3 to 3.5        | Christine Prescott is no longer mentored on Day Shift, counting 1                                                      |
| Day Shift, Tue 27     | 3 to 2          | Diane Patterson's Day Shift changed to Evening Shift · Supervisor                                                      |
| Day Shift, Wed 28     | 3 to 2          | Nathan "Nate" Callahan was given an absence (Sick) instead of Day Shift                                                |
| Day Shift, Thu 29     | 5 to 4          | Barbara Trent was taken off Day Shift                                                                                  |
| Evening Shift, Thu 29 | 4 to 3          | Carol Henderson's Evening Shift changed to Day Shift · Supervisor                                                      |
| Supervisor, Fri 23    | 1 to 1          | Richard Bennett's Day Shift · Supervisor moved to Sat, Oct 24; Susan Fletcher was scheduled for Day Shift · Supervisor |
| Supervisor, Sat 24    | 1 to 2          | Richard Bennett's Day Shift · Supervisor moved here from Fri, Oct 23                                                   |
| Supervisor, Sun 25    | 1 to 2          | Laura Marshall's absence (Off) was replaced with Day Shift · Supervisor                                                |
| Supervisor, Mon 26    | 1 to 0.5        | Richard Bennett is now mentored on Day Shift · Supervisor, counting 0.5                                                |
| Supervisor, Thu 29    | 1 to 2          | Carol Henderson changed from Evening Shift to Day Shift · Supervisor                                                   |

- Every line in the table appeared, each cell's lines add up to After minus
  Before, and both cells of the move name each other's date.
- The other 74 cells showed their unchanged text (35 "Already short when
  published", 39 "Nothing in this draft changed it").
- The comparison line read 2 opened and 7 other cells, matching the table.
- `qa-admin` without shift editing (restored afterwards) saw published
  values only and no What changed or unchanged line.
- Planning this run found that work kept on both sides was named as a
  change; fixed before the run (see Change lines).

## Data / contracts

- **Load-bearing (47c, 47d):**
  - `CoverageContributor` `{ employeeId: string; assignmentId: number;
credit: number }` and `CoverageCategorySnapshot.contributors?` (present
    only with `includeContributors`).
  - `CoverageMatrixCell.contributorChanges: CoverageContributorChange[]`,
    `{ employeeId; publishedAssignmentId: number | null;
draftAssignmentId: number | null; publishedCredit; draftCredit }`.
    47c's "move back" and "restore" suggestions start from these entries.
  - `describeCoverageCellChanges` and `coverageCellUnchangedText` in
    `coverage-change-text.ts`; the day lookup shape `{ assignmentIds:
number[]; absenceTypeId: number | null }`.
- A rest-of-day absence beside a shift is work, not an absence, for these
  lines: the shift is what counts.
- Lines use the full assignment name (`assignmentNameMap`), the shared
  short date format ("Sat, Oct 24") and up to two decimals for credit.
- No schema, API or migration change.

## Testing

- Unit (Vitest): steps 1 and 2 in schedule-core (including the
  sum-of-credits invariant), step 3's component behaviour with mocked
  lines.
- Browser: step 5 on the local app.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run build`, and the docs checks.

## Notes for the AI

- Never recount coverage: contributors are recorded in the loop that
  already computes `actual`, and the step 1 invariant proves they agree.
- Contributors are opt-in because the dashboard and mobile compute
  snapshots too and need none of this; the matrix is built only while the
  panel is open, so the page pays nothing otherwise.
- A person's day lookups read the whole loaded `shifts` map, not only the
  visible dates, so a move into next week still reads as a move.
- Names come from org data (shift, job, focus area, absence); copy says
  "absence", never "off day"; no em dashes; tabular figures.
