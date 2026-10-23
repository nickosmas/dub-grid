# Feature: Build report

**From build-plan:** feature 48f (parent 48, Schedule Builder)
**Status:** verified
**Branch:** `feature/48f-build-report` (cut from `dev` at de8e33ca)

## Goal

After a build, the Build section turns into a short report a manager can read
at a glance: who was given how many shifts and why, anyone over 40 hours a
week, and the shifts still short, each one a link to its cell (where Ways to
fix and Not suggested already explain it). Done closes it; Undo of the build
closes it too.

## Decisions (made for the owner, 2026-10-22)

- **Lean** (owner, 2026-10-22: clean, concise): one headline ("Built 16
  changes for 3 people"), a people list of name, shifts and a short why
  ("Recurring schedule", "Restored", "Moved back", "Fewest hours", "Fewest
  weekends", "Fewest nights", "Only one free", "Even"), five rows then Show
  all; the Over 40 hours a week list only when someone is; Still short only
  when something is, five then Show all. No hours column: the over-40 list
  already names hours that matter.
- **Data:** the preview gains `recurringPeople` (recurring shifts and
  absences per person) and `shortCells` (`rowKey`, `dateKey`, staff short)
  after the build; the report reads only the preview it built from, so it
  is exactly what was written. It does not follow later edits.
- **Linking:** a still-short shift selects that cell in the matrix below.

## Build steps

- [x] **Step 1 - Engine** - `recurringPeople` and `shortCells` in the
      preview.
      _Done when:_ tests cover both, in scope and in date order.
- [x] **Step 2 - Report** - a `built` build state, `buildReportPeople`, and
      the report view with its lists and cell links.
      _Done when:_ panel tests cover the headline, people with their reasons,
      Show all, the over-40 list, still short with a link that selects the
      cell, and Done.
- [x] **Step 3 - Page** - Build success shows the report; Done, a new
      preview, a filter change or Undo of the build close it.
      _Done when:_ in the browser a build shows the report and a still-short
      link selects its cell, and Undo closes the report.
- [x] **Step 4 - Docs** - the Schedule Builder guide describes the report.
      _Done when:_ `docs:check:closed` passes.

## Out of scope

- Saving reports, exporting them, or showing them to anyone else.

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check, and the build is
  undone.
- Never approve the seeded Calm Haven requests.

## Outcome (2026-10-22)

- **Engine:** `recurringPeople` counts each person's recurring shift and
  absence fills; `shortCells` lists cells still short after the build in
  scope, by date then the matrix's row order, with staff still needed (their
  total equals `staffShortAfter`).
- **Report:** the `built` state renders a headline, "What each person was
  given" (shifts, absences and the reasons in a fixed order), the over-40
  list and Still short as links that select the cell; lists show five, then
  Show all. Its wording comes from the preview Build applied, so it is
  exactly what was written. The show-all behaviour is shared with the
  Not scheduled list.
- **Page:** a successful Build keeps its preview as the report; a new
  preview, Done, a filter change or Undo of that build (`build@` entry)
  clears it. It describes the build as applied, not later edits.
- **Evidence:** schedule-core 266 tests (recurring per person, still-short
  order and totals, rows built); web 268 across the panel (four report
  tests), schedule and coverage-check; type-check and lint clean;
  `docs:check:closed` 34 verified. Browser, Calm Haven with a temporary
  requirement (removed): Build applied 16 changes and the report read "Built
  16 changes for 3 people", three people with their shifts and reasons, the
  over-40 list and "Still short: 7 shifts"; the Fri, Oct 23 link opened that
  cell's detail; Undo closed the report and left 16 draft snapshots, as
  before the build.
