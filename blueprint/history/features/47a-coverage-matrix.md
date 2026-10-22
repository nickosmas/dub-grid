# Feature: Matrix and changes since publish

**From build-plan:** feature 47a (parent 47, Staffing check)
**Status:** verified
**Branch:** `feature/47a-coverage-matrix` (cut from `dev` at adbeb3ee)

## Goal

The Schedule page's Coverage panel stops repeating the open-shifts row as a
list of cards. It shows every coverage requirement as a row and every day as
a column, each cell reading staffed / needed and marked short, over or
staffed, for the draft and for the published schedule. A manager sees at a
glance what their draft breaks and fixes compared with what staff see now,
and can open any cell to fill it or find it in the grid. Every number is
computed from the schedule and must be exact (owner, 2026-10-21).

## Design reference

- The "Staffing check panel" canvas:
  https://claude.ai/artifact/KSPPPawq4W1E89ZUJNdmAT. 47a builds the header,
  the comparison line, the two views, the matrix, the staff-short row, the
  legend and the cell detail's Before and After, Still needed, Fill a spot
  and Show in grid. The suggestions list, Ways to fix, Not suggested, the
  "Has a suggestion" dot (47c, 47d) and What changed (47b) come later.
- Where the canvas and the data differ, the data wins:
  - **Rows are requirements, not shifts.** Current requirements name a job
    and a shift, so Skilled Nursing has a row per job on Day Shift (Day
    Shift · Med Aide, Day Shift · Charge Nurse), each with its own count.
    Legacy requirements (by assignment) still group by shift category and
    read as the canvas does.
  - **Counts can be fractional.** A mentored person counts at the
    organization's mentored credit, so a cell can read 2.5/3 and be short
    0.5.
- Only past days are faded, in both views (owner, 2026-10-21).

## In scope

- `@dubgrid/schedule-core`: a stable row identity on each coverage snapshot,
  and a pure matrix builder that compares draft and published snapshots.
- The schedule page computes coverage twice: from the draft (what editors
  see now) and from published cell values (new; today "published" means
  published dates with draft values).
- The panel: header, comparison line, Whole draft / Changes since publish,
  the existing focus area filter, the matrix with a staff-short row and a
  legend, and the cell detail.
- Fill a spot opens the existing staffing modal for that gap; Show in grid
  closes the panel and brings the cells into view.
- Panel states: not published, partly published, Month view, no
  requirements, everything staffed.
- People who can see the panel but not edit shifts see published values on
  published dates only, with no comparison line or views.
- The public guides that describe the panel.

## Out of scope

- What changed per cell (47b), the suggestion engine (47c), suggestions,
  apply, undo, approve and the Publish dialog's counts (47d).
- A Month matrix: Month view computes no coverage today and keeps it that
  way; the panel says so instead of claiming everything is met.
- Mobile, the dashboard and reports.
- The toolbar button's count and danger color, which keep counting today's
  visible gaps.

## Decisions

- **Name (owner, 2026-10-21): "Coverage Check".** The toolbar button and the
  panel title both read "Coverage Check", and the public guides that name the
  button or describe the panel say "Coverage Check" too. "Coverage" stays the
  name of the settings area (**Settings > Coverage**), the coverage
  requirements and the dashboard's coverage cards, which this does not rename.

- **Made while building (2026-10-21, the owner asked for the logical call):**
  - Numbers show up to two decimals, so mentored credit is exact (0.33, 2.5);
    whole numbers stay bare.
  - The shared engine rounds summed credit to drop float noise, so
    0.7 + 0.6 + 0.7 counts as 2 and meets a requirement of 2 everywhere
    (toolbar, dashboard, matrix), not only in the panel.
  - The comparison line also counts cells whose numbers changed without
    opening or closing a gap ("and changes the count in 3 other cells"),
    and reads "This draft matches the published schedule." when nothing
    differs, rather than claiming no gap changed when one got deeper.
  - People who cannot edit shifts see only published columns, under
    "Showing published dates only.", rather than empty "Not published"
    columns.
  - An editor whose window is not published yet still gets the draft
    matrix, with a note that there is nothing to compare, and no views.
  - With no coverage requirements the panel says so and points to
    Settings > Coverage instead of claiming every requirement is met.
  - The category filter goes: rows are requirements, which already name
    the shift. The header counts follow the focus area filter and name it.
  - A started cell shows its numbers but no change mark, in either view.
  - The matrix is built only while the panel is open.

## Build steps

- [x] **Step 1 - Row identity and the matrix builder** - in
      `packages/schedule-core/src/coverage.ts`, each `CoverageCategorySnapshot`
      gains `rowKey`, the grouping key the function already builds
      (`focusArea:category` for legacy requirements,
      `focusArea:job:shift` for current ones), and `rowLabel` (the shift,
      plus the job when the requirement names one). A new
      `coverage-matrix.ts` exports `buildCoverageMatrix` (draft snapshots,
      published snapshots, dates, published dates, a started predicate) →
      rows by focus area, each cell with draft and published status, kind
      (short, over, staffed), change (opened, closed, changed, none), past
      and unpublished flags, plus totals (short and over counts, opened and
      closed counts, staff short per day) that skip past cells.
      _Done when:_ unit tests cover short, over and staffed; opened, closed
      and changed; an unpublished date (no Before, no change mark, not in
      the comparison counts); a started cell (faded, not counted);
      fractional credit (2.5/3 short 0.5, summed per day); a mixed week
      with published and unpublished dates; stable `rowKey` for both
      requirement models; and empty input. Existing coverage tests still pass.
- [x] **Step 2 - Published coverage on the schedule page** - a published
      credit resolver beside `createCoverageCreditResolver` in
      `apps/web/src/lib/schedule-logic.ts` reading `publishedSegments`, and
      the page computes snapshots from `publishedAssignmentIdsForKey` and
      that resolver for published dates, alongside the draft snapshots. For
      people who cannot edit shifts, both sides are the published values.
      _Done when:_ the resolver's unit test shows a draft-only change (a
      removed shift, a moved shift, a mentored segment) counted in draft and
      not in published, and type-check passes.
- [x] **Step 3 - The matrix panel** - the toolbar button
      (`Toolbar.tsx`, its aria label and hint) and the panel title read
      "Coverage Check"; `CoveragePanel.tsx` renders the
      matrix from `buildCoverageMatrix`: header ("{n} shifts short · {n}
      over"), the comparison line ("Compared with the published schedule,
      this draft opens {n} gaps and closes {n}.", ending "on published
      dates" when only some are, or "This draft doesn't change any gap."),
      the two views, the focus area filter, the staff
      short row, legend, today marked, past faded, and the panel at
      `dg-panel--cols-2` with the matrix in its own horizontal scroll box
      and sticky row labels at phone width. States: not published and
      partly published keep their current text; Month says "Coverage is
      checked in 1 Week and 2 Weeks."; no requirements and all staffed keep
      theirs. Non-editors get no comparison line or views, and an unpublished
      day's column reads "Not published" with no counts, since they
      cannot see it.
      _Done when:_ `CoveragePanel.test.tsx` keeps its two cases and adds:
      cells read and are labelled from mocked matrix data, the changes view
      marks opened and closed cells and fades only past ones, a non-editor
      sees no views, Month shows its message, and every cell is a button
      with an accessible name.
- [x] **Step 4 - Cell detail** - selecting a cell shows its title and date,
      a Short / Over / Staffed badge, Before (published, or "Not published
      yet") and After, Still needed from the snapshot's shortage details
      (jobs spelled out), and Fill a spot plus Show in grid for a short,
      not-started cell (Show in grid alone otherwise). Fill a spot opens
      `OpenShiftStaffingModal` with the open shift whose id is
      `gap_{focusArea}_{requirementAssignment}_{date}`; when pending pickup
      requests already cover the rest, it says "{n} pickup requests are
      waiting for this shift." and offers no Fill a spot. Show in grid
      closes the panel, scrolls the section and date into view through the
      cells' `data-section-id` and `data-date-key`, and outlines them
      briefly.
      _Done when:_ component tests cover the detail for short, over,
      staffed, past and unpublished cells and the pending-requests line;
      browser evidence shows Fill a spot opening the modal and Show in grid
      landing on the cells.
- [x] **Step 5 - Public guides** - `docs/features/coverage-and-open-shifts.mdx`,
      `docs/features/schedule-grid.mdx` and
      `docs/configuration/coverage-requirements.mdx` describe the matrix,
      the two views and the cell detail under the **Coverage Check** name,
      instead of "the detailed list of
      gaps".
      _Done when:_ `npm run docs:check` and `npm run docs:verify` pass with
      those pages' fingerprints re-recorded.
- [x] **Step 6 - Browser qualification** - as `qa-super-admin` in Calm
      Haven, light and dark, 1 Week and 2 Weeks at 1440px and phone width,
      with temporary draft edits (a removed shift, a moved shift, an added
      shift; discarded afterwards) and a regular user's view.
      _Done when:_ the header's short count equals the toolbar badge (both
      count draft short cells that have not started), a cell's numbers
      match the grid's count rows wherever the grid shows the same
      requirement and day, the comparison counts match the cells marked,
      the staff-short row matches the cells, a non-editor sees published
      values only, and the Schedule page renders no more than 10% slower
      than before (measured the same way before and after).

## Qualification evidence (2026-10-22)

On the local app as `qa-super-admin`, Calm Haven, with six temporary
coverage requirements and a temporary draft (Thomas Crawford given Thu 22,
Richard Bennett's Fri 23 shift removed and moved to Sat 24), all removed
afterwards:

| Check                                                              | Result                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Header short count vs toolbar badge                                | 29 and 29 in 2 Weeks, 10 and 10 in 1 Week, 28 and 28 for a non-editor                                              |
| Comparison line vs marked cells                                    | "opens 1 gap and closes none, and changes the count in 2 other cells"; 1 opened and 2 changed marked               |
| Staff short row vs cells                                           | Every day equal; 40 in all                                                                                         |
| Matrix vs the grid's open-shifts row                               | 29 open shifts for 29 short cells, 40 needed in both                                                               |
| Started cells                                                      | Faded, no change mark, not counted                                                                                 |
| Non-editor (`qa-admin` without shift editing, restored after)      | Published values only (3/5, 1/1, 1/1 where the draft read 4/5, 0/1, 2/1), no views or comparison                   |
| Fill a spot                                                        | Opened the staffing dialog for "Day Shift, Thursday, October 22, 2 people needed"; assigning updated the cell live |
| Show in grid                                                       | Closed the panel and outlined Skilled Nursing's Thu 22 cells (32)                                                  |
| Light and dark, 1440px and phone width                             | Rendered; at 375px the matrix scrolls in its own box with sticky labels and the page does not overflow             |
| Render timing (navigation to grid complete, same tab, alternating) | Base `adbeb3ee` median 4,955 ms over 6 runs; 47a median 4,793 ms over 5 runs                                       |
| Opening the panel                                                  | 56 to 68 ms in development mode, matrix included                                                                   |

The grid no longer has per-section count rows, so the cell numbers were
checked against the open-shifts row, which shows the same gaps.

## Data / contracts

- **Load-bearing (47b to 47d):** `CoverageCategorySnapshot.rowKey` and
  `rowLabel`, and `buildCoverageMatrix` in
  `packages/schedule-core/src/coverage-matrix.ts`, which returns
  `{ dateKeys, rows: { focusAreaId, focusAreaName, rowKey, rowLabel, cells:
(CoverageMatrixCell | null)[] }[], totals: { short, over, opened, closed,
changed, staffShortByDate } }`. `summarizeCoverageMatrixRows(rows, dateKeys)`
  gives the same totals for a subset of rows. A cell carries `dateKey`, `draft` and `published`
  (`CoverageStatus`, `published` null on a date never published), `kind`,
  `change`, `past`, `shortage`, `shortageDetails` and
  `preferredOpenAssignmentDefinitionId`. A cell is `null` where the
  requirement asks for nobody that weekday.
- Kinds: short when actual < required, over when actual > required, staffed
  otherwise. Change: opened (published staffed or over, draft short),
  closed (published short, draft not), changed (other difference), none.
- Numbers show up to two decimals (2.5/3, short 0.5, 0.33), in tabular figures.
- No schema, API or migration change.

## Testing

- Unit (Vitest): step 1's builder and row identity in schedule-core, step
  2's published resolver in web, step 3 and 4's component behaviour with
  mocked matrix data.
- Browser: steps 4 and 6 on the local app as the QA account.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile` (schedule-core is shared), `npm run build`, and the
  docs checks for step 5.

## Notes for the AI

- Never reimplement coverage math: both sides come from
  `computeCoverageCategorySnapshots`; the matrix only compares them.
- `shifts` entries already carry published fields
  (`publishedAssignmentDefinitionIds`, `publishedSegments`); there is no
  separate published map. `draftKindForKey` is null for non-editors.
- "Started" uses the same rule as `getActionableCoverageGapAssignmentIds`
  (a shift whose time has begun), so today can have both live and past
  cells.
- Rebuild `@dubgrid/schedule-core` after changing its exports
  (`npm run build:packages`).
- Org terminology: focus area, job and shift names come from org data.
  Copy: "absence", not "off day"; no em dashes; numbers use tabular
  figures.
- Every visible number must agree with every other one (owner); step 6's
  cross-checks are the gate.
