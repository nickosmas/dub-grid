# Feature: Schedule Builder - rename and Build section

**From build-plan:** feature 48a (parent 48, Schedule Builder)
**Status:** complete
**Branch:** `feature/48a-schedule-builder` (cut from `dev` at 31ec0627)

## Goal

Coverage Check becomes the **Schedule Builder**. Its top part is about
building: a Build section says what a build considers, previews exactly what
it would do to the draft for the period on screen (the shifts it adds, the
gaps it closes, the gaps it leaves) before anything changes, and **Build**
applies it through the draft as one change with one Undo. The matrix, day
suggestions and cell detail stay below, unchanged. Later parts add recurring
schedules (48b), absences and requests in the preview (48c), the overtime
threshold (48d), fairness (48e) and the build report (48f).

## Decisions (owner, 2026-10-22, and made for the owner)

- **Name (owner):** the toolbar button, the panel title and the public guides
  say **Schedule Builder**. "Coverage" stays for Settings > Coverage, the
  coverage requirements and the dashboard's coverage cards.
- **Fill only (owner):** a build puts back the draft's own removals and moves
  and schedules qualified, free people into short shifts; it never moves or
  replaces anyone already scheduled, never overrides an absence or a waiting
  request, and never approves a pickup.
- **Scope of a build (made for the owner):** the period on screen and the
  focus areas the panel's filter shows. The Build section names both.
- **The period-wide Apply all becomes Build.** The panel's "Apply all draft
  fixes" (shipped 2026-10-22) is replaced by the Build section; a day's
  "Apply all for this day" stays.
- **A preview never goes stale silently:** any change to the draft clears it,
  and Build plans again when it runs; if the result differs from the preview,
  Build shows the new preview instead of applying.

## Build steps

- [x] **Step 1 - The build preview in the engine** - `previewCoverageBuild`
      in `packages/schedule-core/src/coverage-suggestions.ts` plans the build
      with `planCoverageFixes` (gaining a `rowKeys` filter) and returns the
      load-bearing `CoverageBuildPreview`.
      _Done when:_ tests cover the counts by kind, people, gaps before and
      after (cells that have started not counted), the focus area filter, an
      empty plan, and that the same input gives the same preview.
- [x] **Step 2 - Rename** - the toolbar button, its accessible name and
      hint, the panel title and accessible name, and their tests say
      Schedule Builder.
      _Done when:_ no "Coverage Check" remains in `apps/web/src` outside code
      identifiers, and the Toolbar and panel tests pass.
- [x] **Step 3 - Build section** - `ScheduleBuildSection` at the top of the
      panel for editors: what a build considers, Preview build, the preview,
      Build and Cancel, the nothing-to-build and building states, and the
      period-wide Apply all removed.
      _Done when:_ component tests cover idle, a preview with counts, an
      empty preview, a failed preview, Build and Cancel calling back, Build
      disabled while another apply runs, no section for someone who cannot
      edit shifts or in Month view, and no period-wide Apply all.
- [x] **Step 4 - Page wiring** - the page computes the preview on request
      (after the spinner can paint), clears it when the draft or filter
      changes, and Build plans again, compares, and applies through the
      existing batch path as one Applied entry ("Built the draft: 16
      changes") with Undo. Undo puts back only the cells the build wrote
      that nobody has changed since, and says how many it left alone. A
      planner error shows on the preview, not as a silent nothing.
      _Done when:_ a unit test covers the Undo rule (unchanged cells put
      back, changed ones kept and counted), type-check passes, and the
      browser check (step 6) shows the rest.
- [x] **Step 5 - Guides** - `coverage-and-open-shifts.mdx`,
      `schedule-grid.mdx` and `coverage-requirements.mdx` use the new name
      and describe Build.
      _Done when:_ `docs:check` passes with fingerprints re-recorded.
- [x] **Step 6 - Browser check** - Calm Haven as `qa-super-admin` with
      temporary requirements (removed afterwards): Preview matches what Build
      then does to the matrix, Undo restores the published state, a draft
      edit clears the preview, the focus area filter limits the build, phone
      width fits, and a two-week preview takes under 2 seconds on this
      machine (recorded either way).

## Data / contracts

- **Load-bearing (48b to 48f):**

  ```ts
  interface CoverageBuildPreview {
    fixes: CoverageSuggestion[]; // in the order they will be applied
    counts: { assign: number; restore: number; moveBack: number };
    people: number; // distinct people the build changes
    shortBefore: number; // short cells that have not started
    shortAfter: number;
    overBefore: number;
    overAfter: number;
  }
  previewCoverageBuild(input, { rowKeys?, dateKey?, availabilityWith? })
  ```

  48b adds recurring fills, 48c skipped people, 48d over-threshold shifts,
  48e reasons; each extends this shape.

- No schema, API or migration change.

## Built differently from the draft

- **The preview also counts people still needed** (`staffShortBefore`,
  `staffShortAfter`): a build that adds people without filling any shift
  completely read as "Short shifts 2 now, 2 after", which looked like it did
  nothing.
- **A preview is tied to the draft's counts, not to the suggestions
  object**, which is rebuilt on every background refresh and cleared the
  preview within seconds. Build still plans again and compares, so a change
  the counts miss is caught there.

## Out of scope

- Recurring schedules in the build (48b), skipped-people lines (48c), the
  overtime threshold (48d), fairness (48e) and the build report (48f).
- Renaming code identifiers (`CoveragePanel`, `coverage-check/`); only what
  people see changes.
- Mobile, which has no Coverage Check.

## Testing

- Unit: step 1 in schedule-core; steps 2 and 3 component tests in web.
- Browser: step 6.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile` (schedule-core is shared), `docs:check`.

## Notes for the AI

- Never reimplement coverage math; the preview counts with the same
  `withDraftOverrides` matrix the planner uses.
- Every number the preview shows must equal what Build does (owner: insights
  are exact).
- No em dashes; "absence", not "off day"; numbers in tabular figures.

## Result

- Coverage Check is the Schedule Builder in the toolbar, the panel and the
  public guides. A Build section at the top says what a build does,
  previews it (changes, people, kinds, short shifts and staff short now and
  after), and Build applies it through the draft as one Applied entry.
- Browser, Calm Haven with two temporary requirements (removed afterwards):
  a two-week preview took 159 ms; it showed 16 changes for 3 people, short
  shifts 9 to 7 and staff short 27 to 11, and Build left the matrix at
  exactly 7 short; Undo restored the published schedule; a day's Apply all
  cleared an open preview; Cancel returned to idle; phone width fits.
- Undo now puts back only cells that still hold what was applied, for every
  Applied entry, and says how many it left alone.
- Found, not fixed: at phone width the Tools menu offers no Schedule Builder
  (Coverage Check was not reachable there either), so the panel opens only
  from the desktop toolbar.
