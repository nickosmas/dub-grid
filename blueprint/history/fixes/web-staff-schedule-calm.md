# Fix: a calm web schedule for staff who can't edit it

**Type:** Fix
**Status:** complete

## Problem

Someone without Edit shifts or Edit notes who has a linked employee (a
regular user) saw the web schedule as if they could build it:

- Every grid cell drew the hover tint, a pointer, a tab stop and a right-click
  menu, and an empty cell offered a "+" for a new shift, though they can only
  open their own shifts. The phone-width Day view did the same, and its empty
  state told them to assign people from the People page.
- The read-only person panel showed "On staff since" from `statusChangedAt`,
  the last status change rather than a start date.
- The schedule toolbar's Tools menu held only Requests and Print for them.
- A shift with their active request said "Request already active" with no way
  forward: the panel showed a banner, and the right-click menu never opened.

## Fix

- `ScheduleGrid` and `MobileDayView` take a per-cell `canOpenCell` accessor
  (on the grid model's accessors). A cell it refuses is plain: no hover,
  pointer, click, context menu, tab stop or Enter; in the Day view it is not a
  button. The schedule page passes it only to viewers who don't edit (their
  own shift with details, or with a request they can open or make). Editors
  get no accessor, so every cell, tab stop and keyboard path stays as it was.
- The empty cell's "+" shows only to someone who places shifts
  (`data-addable`, from `canDragShifts`). The "Assign people here" advice in
  the grid and Day view shows only to editors.
- `StaffReadOnlyDetailPanel` drops "On staff since".
- `Toolbar`: when the Tools menu would hold nothing but Requests and Print,
  both are buttons on the toolbar instead. Requests carries the shared quiet
  count (`NumericBadge tone="label"`, `.dg-btn-count`, the tab count's style);
  neither button has an icon. Editors keep Tools.
- Active request: the panel shows **View request** and **Cancel request**
  under the banner; the right-click menu says "Request already active" with
  **View request**, including after the shift starts. View request opens the
  request board on My requests with that request marked and scrolled into
  view (`focusRequestId`). Cancel request confirms with the board's own copy
  (`describeCancelRequestConfirmation`, now shared) and calls the same
  `shiftRequests.cancel`, keeping the dialog open if it fails.

## Evidence

- Tests: `ScheduleGrid.test.tsx` (plain cells take no click, menu, Enter or
  tab stop and show no "+"; editors keep all), `MobileDayView.test.tsx`
  (only openable days are buttons; empty-state advice), `Toolbar.test.tsx`
  (direct Requests with a quiet count and Print; Print off when printing is
  off; editors keep Tools), `ShiftContextMenu.test.tsx` (View request;
  `resolveShiftRequestMenuState`), `ShiftEditPanel.test.tsx` (view, confirm
  and cancel, the unanswered-recipient caution, failure keeps the dialog),
  `ShiftRequestBoard.test.tsx` (opens on the focused request),
  `cancel-request-copy.test.ts`, `StaffReadOnlyDetailPanel.test.tsx`.
- Type-check, lint, docs check pass. Docs: schedule grid, schedule tools,
  shift requests, integrations and exports.

## Not in this fix

- Requests history and publish notices for staff, and the mobile parts of
  the fervent-ride port: separate fixes.
- Superseded and not ported: Away bar wording, hidden status pills, the
  person panel's gradient header, management profiles (#515).
- No running-app check: covered by component tests only.
