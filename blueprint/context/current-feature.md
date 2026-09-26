# Feature: Web schedule views show indicators

**From build-plan:** feature 42a
**Status:** in progress

## Goal

A schedule indicator shows wherever a person's shift is shown on the web
schedule, not only in the week and two-week grid: in Month view, in the
phone-width day view, in the shift slideover for people who cannot edit
indicators, in the grid's hover card on changed cells, and on the printed
schedule with a legend. Every surface uses the indicator's own name and
colour and the existing visibility rule.

## In scope

- **Shared marks.** Every surface reads the page's existing
  `noteMarksForKey(empId, date, focusAreaId)` and renders through the shared
  `NoteDots`, which gains an inline placement for layouts that are not
  positioned (its absolute placement stays the default for the grid).
- **Phone-width day view.** The generic blue dot and its focus-area-only
  condition go. Each shift shows its marks through `NoteDots`, looked up the
  way the grid looks them up, with the section's focus area. The phone
  view's sections are always focus areas, so the old condition was always
  true; the real change is named, coloured marks with their draft states.
- **Month view.** Day cells show counts, not people, so indicators appear
  where each person's shift does: the day popover's rows. Each row carries
  its employee and focus-area ids so its marks can be found.
- **Shift slideover, read-only list.** Someone who can open a shift but
  cannot edit indicators sees an "Indicators" list of the active ones, each
  with its colour and name, beside the pill's dots, which alone never said
  what they meant. Split shifts
  list per card. Editors keep today's editor unchanged.
- **Grid hover card.** The indicator line stays when a cell has change
  details (a draft, a publish difference or a request badge), including a
  deleted shift that keeps its indicators.
- **Printed schedule.** The Print view (Tools, then Print) shows each cell's
  indicators and an indicator legend listing the ones that appear. The
  browser print of the page (its print legend) gains the same indicator key.
  Colours are literal values, since the print window has none of the app's
  CSS variables.

## Out of scope

- Mobile (42b, 42c) and the secondary surfaces (42d).
- Indicator storage, editing permissions and the draft and publish workflow.
- An organization-configurable name for indicators. "Indicators" is today a
  fixed product term (settings, reports, the editor), not one of the
  organization's labels; adding one is a separate decision.
- Month view's day cells themselves, which show no individual shifts.

## Visibility rule (unchanged, load-bearing)

- The server already drops draft notes for anyone who cannot see drafts
  (`canEditShifts || canEditNotes`), and `buildScheduleNoteMarks` shows
  editors their draft additions and removals and everyone else published
  marks only.
- Month view and the phone view never show publish differences (they are
  switched off there), so their marks are published, draft-added or
  draft-removed only.
- Print uses the same marks as the screen, without publish differences.

## Build steps

- [x] **Step 1 - inline NoteDots and the phone day view** - `NoteDots` takes
      a `placement` of `"corner"` (default, today's absolute placement) or
      `"inline"`; `MobileDayView` takes `noteMarksForKey` and
      `indicatorTypes`, drops `activeIndicatorIdsForKey` and the blue dot, and
      renders inline marks. _Done when:_ a
      `NoteDots` test shows inline placement is not absolutely positioned; a `MobileDayView` test shows a shift's named marks looked up with the section's focus area, a draft mark only when the marks carry it, and no dot without indicators.
- [x] **Step 2 - Month view day popover** - rows carry `empId` and
      `focusAreaId`; `MonthView` takes `noteMarksForKey` and
      `indicatorTypes` and shows each row's marks inline. _Done when:_ a
      `MonthView` test opens a day and finds each person's indicator by name,
      looked up with the row's focus area.
- [x] **Step 3 - read-only indicator list in the slideover** -
      `ShiftEditPanel` renders a labelled list (colour and name) of the
      active indicators when the viewer cannot edit indicators, per card for
      split shifts, and nothing when there are none; editors see no change.
      _Done when:_ panel tests show the list for a viewer without
      `canEditScheduleIndicators`, per card on a split shift, no list when
      none are active, and the editor's add and remove controls unchanged.
- [x] **Step 4 - hover card keeps its indicator line** - the line renders
      whenever there are indicators, beside any change details. _Done when:_
      grid tests show the line on a draft-changed cell, a publish-diff cell
      and a deleted shift that keeps its indicators.
- [ ] **Step 5 - printed schedule** - `PrintScheduleView` takes
      `noteMarksForKey` and `indicatorTypes`, draws each cell's marks with
      literal colours, and adds an "Indicators" legend of the types that
      appear (none when none do); `PrintLegend` gains the same key for the
      browser print. _Done when:_ print tests show a cell's indicator, the
      legend listing only the indicators present, no legend without any, and
      no `var(--` in the indicator markup; a legend test covers
      `PrintLegend`.

## Files / areas

- `apps/web/src/components/schedule-grid/noteDots.tsx` and a new test.
- `apps/web/src/components/MobileDayView.tsx`, `MonthView.tsx`,
  `ShiftEditPanel.tsx`, `ScheduleGrid.tsx` (hover card),
  `PrintScheduleView.tsx`, `PrintLegend.tsx`, and their wiring in
  `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`.
- Tests: `ScheduleGrid.test.tsx`, `ShiftEditPanel.test.tsx`,
  `PrintScheduleView.test.tsx`, and new `MonthView`, `MobileDayView`,
  `NoteDots` and `PrintLegend` tests. `typography-contract.test.ts` counts
  styles per file and may need its counts updated.

## Data / contracts

- No schema, route or API change: notes and indicator types are already
  loaded on the schedule page.
- `NoteDots` gains `placement?: "corner" | "inline"`; the default keeps every
  current caller unchanged.
- An archived or unknown indicator keeps today's fallback (the name "Note",
  muted colour) on screen; print uses a literal grey for it.

## Testing

- Component tests for each surface, following `ScheduleGrid.test.tsx` and
  `ShiftEditPanel.test.tsx`.
- Browser check of Month view, the phone-width day view and the Print view
  on the local stack with a seeded indicator (the seeds carry none, so the
  check adds one to a QA organization and removes it after).
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- Dark mode: the grid's `NoteDots` uses the raw colour; keep that for
  consistency rather than adding a transform in this feature.
- Operational text keeps tabular numerals where it already has them.
- No em dashes.
