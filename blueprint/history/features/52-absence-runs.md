# Feature: Absence runs in the grid

**From build-plan:** feature 52
**Status:** verified

## Goal

In the Week and 2 Weeks schedule grid, a whole-day absence on days in a row
reads as one bar per week instead of a row of identical pills, labelled with
its name and a count ("Vacation ×4", "Off Day ×2"; one day shows just the
name). Each day stays its own cell for clicking, dragging, pasting and screen
readers, and a day's panel can remove that day or the whole run with one
Undo. 51e's Away bar is drawn the same way, so this lands first.

## Design reference

The "Absence runs in the grid" board on the "Staff status across surfaces"
canvas (https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo). Owner decisions,
2026-10-26: no grid lines inside a run; no tint over the label; hovering a
day draws dashed left and right edges around it, hides the label and lights
its column header; names are never pluralized (×N instead); every whole-day
absence runs, the day off absence included.

## In scope

- A pure run builder in `@dubgrid/schedule-core` (reused by 51e).
- The Week and 2 Weeks grid: runs drawn as one bar per week, label once,
  inner day dividers suppressed, per-day hover with dashed edges, label
  hidden while hovering, the hovered day's column header lit.
- The cell panel for an absence in a run: "Part of 4 days, Mon, Nov 9 - Thu,
  Nov 12" and a choice between removing this day and removing all of them,
  applied as one draft change with one Undo.

## Out of scope

- Month, print, the phone-width Day view and mobile (they keep one item per
  day).
- Changing the absence for the whole run (only removal gets the run choice).
- Status bars for Away (51e) and last day (51g).

## Build steps

- [x] **Step 1 - Run builder.** `buildAbsenceRuns(days, { splitAt })` in
      `packages/schedule-core/src/absence-runs.ts`. Each day is
      `{ absenceTypeId: number | null, hasShift: boolean, changed: boolean }`;
      a run is two or more days in a row with the same whole-day absence, no
      shift, not changed in the draft, inside one week (`splitAt`, 7 for 2
      Weeks). Returns, per day, `null` or `{ runIndex, start, length,
position: "start" | "middle" | "end" }`, plus the runs.
      `formatAbsenceRunLabel(name, length)` gives "Vacation" or
      "Vacation ×4". _Done when:_ tests cover single days, a run, a run
      broken by a different absence, a shift, a rest-of-day absence, a draft
      change and the week split, two runs in one week, and the label.
- [x] **Step 2 - Grid bar.** In `SectionBlock`'s staff rows, compute runs per
      row from the existing accessors. For days in a run: the pill becomes a
      segment with square inner corners and no inner borders, the leading
      day divider between run days is suppressed, and the run's start cell
      carries one label spanning the run ("Vacation ×4"), centered, not
      clickable. Single days look as today. `readSectionCell` and
      `sectionBlockPropsAreEqual` cover every new read. _Done when:_
      ScheduleGrid tests show a 4-day run renders one "Vacation ×4" label,
      no inner dividers, four gridcells each still clickable and labelled
      for screen readers, a break at the week split and at a draft change;
      a screenshot.
- [x] **Step 3 - Hover.** Hovering a day in a run draws dashed left and right
      edges on that day, hides the run's label, and lights that day's
      column header (headers gain `data-date-key`). Done with DOM
      attributes from `onMouseEnter`/`onMouseLeave` so the grid doesn't
      re-render on hover. _Done when:_ a test shows the attributes set and
      cleared; a screenshot of a hovered day.
- [x] **Step 4 - Panel.** The panel for an absence day in a run says "Part of
      N days, Mon, Nov 9 - Thu, Nov 12" and, on remove, asks "Remove this
      day" or "Remove all N days" (the series-scope choice pattern). Removing
      all is one batch through `applyShiftDeleteUpdates`, with a toast Undo
      that restores the run. _Done when:_ panel and page tests cover both
      choices and Undo; a screenshot of the panel.

## Files / areas

- `packages/schedule-core/src/absence-runs.ts` (+ test, export)
- `apps/web/src/components/ScheduleGrid.tsx`, `app/app-ui.css`
- `apps/web/src/components/ShiftEditPanel.tsx`,
  `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`

## Data / contracts

- **Load-bearing:** `buildAbsenceRuns` and `formatAbsenceRunLabel` in
  `@dubgrid/schedule-core`; 51e and 51g draw status bars with them.
- No migration, no API change.

## Testing

- Unit: the run builder and label.
- Component: ScheduleGrid run rendering and hover attributes; ShiftEditPanel
  run copy and choices.
- Browser: screenshots of a run, a hovered day and the panel.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`.

## Notes for the AI

- Never break per-day interaction: every day keeps its gridcell, aria-label,
  click, drag and paste.
- No tint over the label; the label never moves when a day is hovered, it
  only hides.
- Use the absence type's `name` for the label, with ×N only for two or more.
- Copy follows the confirmation rules: title names the thing, a message only
  when it adds, no person names in messages.

## Outcome

- **Built:** `buildAbsenceRuns` and `formatAbsenceRunLabel` in
  `@dubgrid/schedule-core`; `buildRowAbsenceRuns` shared by the grid and the
  page; `AbsenceRunBar` draws one label per run over day segments with the
  inner dividers suppressed; hover marks the day, its header and the bar
  through data attributes (no re-render); the panel's "Part of N days" and
  the This day / All N days removal with a toast Undo that restores only days
  unchanged since (`planAbsenceRunRemoval`).
- **Decisions:** a day newly added in the draft breaks a run until it's
  published; bulk-delete mode keeps per-day pills; a run inside a repeating
  series keeps the series removal dialog; the bar label uses caption size.
- **Evidence:** `npm run type-check`, `npm run lint` (two existing warnings),
  `npm run test` (web 6,463, mobile 1,518, packages all passing after one
  typography-contract fix: the run line no longer dims with opacity),
  `npm run docs:check`; screenshots of runs, a hovered day, the panel and the
  remove choice on the local app.
