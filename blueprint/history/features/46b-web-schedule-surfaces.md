# Feature: Web schedule surfaces

**From build-plan:** feature 46b (parent 46, Clear shift-change descriptions)
**Status:** verified

## Goal

The schedule page describes every change with the shared model from 46a:
the grid's hover card and chip tooltips, the deleted pill, the edit panel's
unsaved-changes summary and Publish History all show the same detailed
Before and After (or "Was") reading, compared with the original published
shift.

## Design reference

- The "Shift change display" canvas:
  https://claude.ai/artifact/6AEf3RfYuGAGFvCDsLhEvA ("Web - schedule
  grid", "Web - publish history and edit panel", "Double shift changes").
- The owner's rules are condensed in the 46a archive
  (`blueprint/history/features/46a-shift-change-model.md`).

## In scope

- A web adapter: name resolvers from the organization's data (archived
  definitions included) and the in-window baseline merge per cell.
- Shared web components: the Before and After card, the "Was" block, and
  the day bar.
- The schedule page keeps each cell's original published state across the
  in-window publishes, and drops a cell whose changes net to nothing.
- Grid: the hover card (Was block for one item, the full card with day
  bars for a multi-item day), the chip tooltips when hover cards are off,
  the deleted pill, and the manager's draft reading.
- The edit panel's unsaved-changes summary.
- Publish History: one card per change, per publish.

## Out of scope

- Dashboards, the activity log and the Gridmaster record (46c), mobile
  (46d), alerts (46e), the staff setting (46f), other 24-hour displays
  (46g).
- The chip text itself ("New", "Edited", "Deleted") and ring colors.

## Build steps

- [x] **Step 1 - Web adapter** - `apps/web/src/lib/shift-change-web.ts`:
      `buildShiftChangeResolvers` (shift = shift category, job, shift-only
      jobs show the shift alone, default times from the assignment then its
      category, break from the category, archived flags) and
      `mergeCellPublishChanges` (one cell's in-window changes, oldest first,
      to one change with the earliest "from" and the newest "to", or null).
      _Done when:_ unit tests cover resolution, archived names, shift-only
      jobs, and the merge cases (Day, Evening, Night; back to the original;
      added then removed).
- [x] **Step 2 - Components** - `components/shift-change/`:
      `ShiftChangeCard` (side by side or stacked, headings, highlights,
      labels, totals, tags, "No shift", break lines, optional day bars) and
      `ShiftChangeWas`. _Done when:_ type-check passes and they render in the
      grid step.
- [x] **Step 3 - Original baseline on the schedule page** -
      `publishChangesMap` merges each cell's in-window changes through
      `mergeCellPublishChanges`. _Done when:_ a cell published Day, Evening,
      Night in the window reads Day to Night, and one changed back shows no
      mark.
- [x] **Step 4 - Grid** - the hover card, chip tooltips, deleted pill and
      draft reading use the model. _Done when:_ browser evidence shows the
      Was block, the multi-day card with bars, and the deleted pill.
- [x] **Step 5 - Edit panel** - the unsaved-changes summary is a stacked
      card compared with the panel's opening state. _Done when:_ browser
      evidence shows it for a shortened shift with a rest-of-day absence.
- [x] **Step 6 - Publish History** - each change is a card. _Done when:_
      browser evidence shows a single change, a multi-item day and an archived
      shift by name.

## Data / contracts

- No schema or API change. Uses `describeShiftChange`,
  `cellStateToChangeDay`, `selectOriginalCellChange` and the text
  formatters from `@dubgrid/schedule-core`.
- `mergeCellPublishChanges` returns a `PublishChange` whose "from" fields
  all come from the earliest change and "to" fields from the newest; the
  kind is derived (no "from" = new, deleted "to" = deleted).

## Testing

- Unit: step 1's adapter and merge (Vitest, colocated).
- Browser: steps 4 to 6 on the local web app as `qa-super-admin` in Calm
  Haven, light and dark.
- Gates: `npm run type-check`, `npm run test:web` (focused files), `npm run
lint`.

## Notes for the AI

- ScheduleGrid styles inline with `--dg-*` tokens; the new components use
  Tailwind theme classes over the same tokens.
- Org terminology: names come resolved from org data.
- Copy: "absence", never "off day"; no em dashes.
- Rebuild `@dubgrid/schedule-core` in the main checkout is already done;
  the worktree resolves `@dubgrid/*` there.

## Evidence

- Unit: `shift-change-web.test.ts` (14), schedule-core (145), and the
  schedule, publish, grid and dashboard web suites (171 files, 1,700 tests)
  after rebasing onto the striped-absence fix.
- Browser (local, `qa-super-admin`, Calm Haven, light and dark): two test
  publishes in the window gave "3 edited across 2 publishes" (a cell changed
  back dropped out); Monday's hover card read "Was" Evening Shift, the
  original, not the version in between; Wednesday's card showed both days
  with day bars, Shift 1 and Shift 2, Removed and Added, and 17 and 8.5 hour
  totals; Publish History showed one Before and After card per change with
  the focus area marked.
- Edit panel: covered by its component test (the card renders Before,
  After and the added absence); not exercised in the browser, to avoid
  writing drafts into the shared local schedule.
- Fixed during checks: names now come from the shift and the job, so one
  shift reads the same in every focus area; malformed stored times read as
  empty; day totals hide when no times are known.
