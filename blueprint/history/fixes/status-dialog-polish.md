# Fix: Status confirmation dialogs polish

**Type:** Fix
**Status:** verified

## The problem

Owner report, 2026-10-28, with screenshots of "Mark Jared Onsabwa active?"
and "Cancel Rosa Returnwell's planned return?":

1. A confirmation for one change (Mark active, Reinstate, Restore, Offboard)
   and the plan dialogs (Edit plan, Change return date) repeated the
   person's current status card, and a plan's dashed planned card, above
   the question. The title already names the change.
2. "Cancel planned return" and its undo, "Keep planned return", were ghost
   extra-small buttons that read as stray bold text, most of all once the
   date field above them was gone.

## The fix

- **No status card in a confirmation.** Web `EmployeeStatusActions` and
  mobile `PersonDetailScreen` show where the person stands only above the
  Change status list, where it orients the choices. A single-change or plan
  dialog starts with its fields, or its outcome line.
- **A real toggle.** One `PlanCancelToggle` per app replaces the four
  cancel and keep toggles (planned away, suspension, return, last day): a
  secondary small button on web with a calendar-cross or undo icon, and a
  neutral compact button with the matching Ionicons on mobile, sized to its
  label.

## Checks

- Web: `EmployeeStatusActions`, `StaffDetailPage` and `StaffDetailPanel`
  tests, 76 of 76.
- Mobile: `PersonDetailScreen` tests, 88 of 88, two assertions now expect
  the status text once (on the profile, not in the sheet);
  `ProfileWorkScreen` passed.
- Type-check of web and mobile, lint of the changed files.
- Browser, local Calm Haven as the QA Super Admin: Mark Diane Patterson
  active shows only the outcome line; Carol Henderson's Edit plan shows the
  dates and a bordered "Cancel planned away" button, which turns into
  "Keep planned away" with an undo icon above the Changes box.
- Not checked on the simulator: the worktree's Metro bundle loaded but the
  app could not reach the worktree web server, so the mobile sheet was not
  seen.
