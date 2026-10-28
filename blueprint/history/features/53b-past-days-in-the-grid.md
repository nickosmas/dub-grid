# Feature: Past days in the grid

**From build-plan:** feature 53b (item 53, Past-day corrections)
**Status:** verified

## Goal

Days before today are finished. In the Week and 2 Weeks grid they carry a
light wash, nothing bulk or automatic touches them, the server refuses a
draft for them, and clicking a past cell opens Correct this day, which saves
through 53a's correction.

## Design reference

The inline prototype the owner approved on 2026-10-28: past day columns and
headers get a light wash (about 3% of the text color), shift pills and
absences stay at full color, today's column keeps its accent. The panel
keeps the edit panel's shift and absence pickers and adds reason chips
(Called off, Left early, Swapped with someone, Wrong shift recorded, Other
with a note), with Before and After, and the button reads Save correction.

## Decisions made (owner, 2026-10-28)

- Light tint only; never heavier.
- Correcting needs Edit shifts and Publish schedule; Admins correct the last
  14 days, older days need a Super Admin.
- A correction applies at once with no draft and no alert.

## Decisions made here (to confirm at review)

- **Who sees what on a past cell.** Someone who can correct gets Correct this
  day. Someone who can edit shifts but not correct, or an Admin on a day more
  than 14 days ago, gets the panel read-only with one line saying why
  ("Correcting a past day needs Publish schedule." / "Only a Super Admin can
  correct a day more than 14 days ago."). Everyone else sees what they see
  today.
- **Notes and series stay out of a correction.** The panel hides schedule
  notes, Repeat and series controls in correction mode; the correction saves
  this one day.
- **The server blocks past drafts with a trigger**, not in each function, so
  every path is covered. Paths that span days (series, import) skip past
  days instead of failing.

## Build steps

1. [x] **Today in the organization's timezone everywhere the page plans.**
       Auto-build's day-off and plan checks (`SchedulePageClient.tsx` around
       7296, 7363, 7412) use `todayKey`, not `formatDateKey(new Date())`, and a
       shared `isPastDateKey(dateKey, todayKey)` lives in `@dubgrid/schedule-core`.
       **Done when:** tests for `isPastDateKey`, `type-check` pass, and no
       planning code in the schedule page reads the browser's date.
2. [x] **Past days in the grid.** `ScheduleGrid` washes past day cells and
       headers (a new semantic token, light and dark), and a past cell is never a
       drag source or drop target, never bulk-selectable, and its context menu
       offers no paste or clear. Grid tests cover the wash attribute, drag, bulk
       selection and the menu on a past cell.
       **Done when:** the grid tests pass and a screenshot shows the wash.
3. [x] **Nothing bulk or automatic writes a past day.** Paste, clear, bulk
       delete, Fill from Recurring Schedules and Auto-build skip past days on the
       client, through the page's `schedulableOn` (now
       `_lib/schedulable-on.ts`, which refuses a day before today) and the bulk
       targets; past days are skipped quietly, as Away days are. Tests for the
       rule.
       **Done when:** the planner tests pass.
4. [x] **The server refuses a past draft (migration 111).** The cell save
       and the cell clear, which every single-day draft write goes through
       (paste, the panel, fills, Auto-build, both ends of a move, bulk delete),
       refuse a day before the organization's today ("Past days are corrected,
       not drafted"); the manage route answers 422. Series and import, which plan
       whole spans, are kept to today and later by the page instead of a trigger,
       since copying their long bodies forward to skip days wasn't worth it and
       a series can't start from a past cell. A live integration test covers
       save, clear, move and a correction.
       **Done when:** the tests pass with 111 applied.
5. [x] **Correct this day.** `ShiftEditPanel` takes a correction mode: the
       title names the day, notes and series controls are hidden, the reason
       chips and note sit above the footer, Before and After shows the published
       day against the edit, and Save correction stays disabled until something
       changed and a reason is picked. The page opens it for a past cell when
       the person can correct that day (read-only with its one line otherwise),
       sends it through a new `correctShift` client call, merges the echoed
       cell, closes, and toasts "Day corrected."; a refusal shows its message.
       **Done when:** a browser check on the local stack corrects yesterday for
       a QA person, the cell shows the new state after a reload, the activity
       log has the row, and screenshots show the panel and the read-only line.

## Out of scope

- The Corrected mark on the cell, the activity log's rendering, dashboard
  hours and public docs (53c).
- The Month view and the phone-width Day view (they show the past as
  today; corrections are made in Week and 2 Weeks).
- Open shifts and schedule notes on past days.

## Testing

- Unit tests for `isPastDateKey`, the planners and the grid's past-cell
  behavior; a live integration test for 111; browser evidence for the
  panel. Full `test:web`, `type-check`, `lint`, `docs:verify` and
  `db:migrations:check` before completion.

## Notes for the AI

- `todayKey` is already the organization's date (`SchedulePageClient.tsx`
  near 596); pass it down rather than recomputing it.
- Drag is already blocked on away-locked days in `ScheduleGrid.tsx` (near
  `isAwayLocked`): follow that pattern for past days.
- The panel's confirm path is `handleConfirmEditPanel`; the correction is a
  separate handler, not a branch inside the draft save.
- The Staff management phrasing review session is changing copy in
  `ScheduleGrid.tsx`, `ShiftEditPanel.tsx`, `ShiftContextMenu.tsx` and
  `Toolbar.tsx`; rebase onto it if it lands first.

## Completion evidence

- `migration-111-past-days-not-drafted.integration.test.ts` (4 cases) and the
  37 schedule, approval, request and 067 to 111 migration suites (229 tests)
  with 110 and 111 applied locally.
- Unit tests: `isPastDateKey`, `buildSchedulableOn`, the grid's past-day
  test (wash marker on cells and headers, no drag, no context menu, still
  opens), and the manage route's 422 for a past draft.
- Browser, local stack (Calm Haven, QA Super Admin): 201 past cells carry
  the 3% wash and none is draggable while 58 of today's are; a past cell
  opens Correct this day; Richard Bennett's Mon, Oct 26 Day shift was
  corrected to Sick with Called off, and the database shows the published
  absence with no draft, the correction row and a `shift.corrected` audit
  row.
- Docs: the grid, tools and Auto-build pages describe past days; 13 pages
  re-fingerprinted and the inventory refreshed; `docs:verify` passes.
- Not browser-checked: the read-only line for someone without Publish
  schedule or an Admin past 14 days (page logic only).
