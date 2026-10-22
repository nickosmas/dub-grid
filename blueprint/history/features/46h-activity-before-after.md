# 46h - Activity log Before and After

**Type:** Feature
**Status:** complete
**Branch:** `feature/46h-activity-before-after` (cut from `dev` at e3f4da02)

### Goal

The organization activity log shows each schedule edit as Before and After,
with the person's name, the way every other shift change reads (item 46).

### Decision (delegated by the owner, 2026-10-21)

The save records the cell's earlier state with one extra read rather than a
migration that changes what three database functions return. The read is the
cell's draft when it has one, else what is published; the save's version
check means a save that succeeds replaced exactly that. A failed read never
fails the save: the row then keeps the new state alone. Series and recurring
rows keep their summaries.

### Build steps

- [x] **1. Record the earlier state.** `upsertShift`, `deleteShift`,
      `deleteShifts`, `upsertShiftTimes` and `moveShift` store `before` (and a
      move's `targetBefore`) beside the new state; a time edit stores its new
      state as `input`.
      _Done when_ a route test finds the earlier cell in an edit's audit row.
- [x] **2. Describe it.** `withShiftChanges` turns a row into a `ShiftChange`
      (a move shows the day it landed on) with each organization's names
      loaded once; the activity route attaches it, and a shift row names the
      person whose day it is.
      _Done when_ unit tests cover an edit, an addition, a removal, a move, an
      old row and the person's name.
- [x] **3. Show it.** The details dialog shows the Before and After card with
      the day bar in place of the field list; the docs say so.
      _Done when_ the dialog renders it for a recorded edit.
- [x] **4. Qualification.** Edit a shift locally and read the activity
      route's row and the dialog.

### Evidence

Local, 2026-10-21, this branch's dev server, Calm Haven, as
`qa-super-admin`, on QA Regular's empty Thu, Nov 12:

- An add, a time change (9:00 AM - 5:00 PM) and a removal through
  `/api/schedule/manage` each wrote a row the activity route returns with
  the target "QA Regular" and a `shiftChange`: No shift to Day Shift ·
  Office · 7:00 AM - 3:30 PM (8.5 hrs) · Skilled Nursing, then that to
  9:00 AM - 5:00 PM (8 hrs), then that to No shift.
- Settings > Activity lists them as "Change: ... → ..." and the details
  dialog shows the Before and After card with the changed times marked.
- The removal row first printed its stored state field by field; it now
  reads as the change, and the removal has an explicit empty field list.
- The test rows were removed afterwards.

### Verify

`npm run type-check`, `npm run lint`, `npm run test` and `npm run docs:check`
pass.

### Out of scope

- Approved requests and import-previous, which write no audit rows.
- Rows written before this change.
