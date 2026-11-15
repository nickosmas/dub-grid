# Fix: Away changes that are still drafts show on the schedule

**Type:** Fix
**Status:** complete
**Design:** the "Away drafts on the schedule" canvas
(https://claude.ai/artifact/5rsTAYezHcvoqRS7hvAfCm), approved 2026-11-15 with
every edge case below.

## Problem

Marking someone Away (until a date, or planned from a later date) writes their
days into the draft: shifts come off, or the days hold the Away absence such as
Vacation (migrations 099, 100, 103). The "Drafts in other pay periods" banner
counts those drafts, but in that period the Week and 2 Weeks grid draws a grey
Away bar over the days with no draft marking (`showDiffCellTint` is off under
an Away bar), so a manager finds nothing to publish. The same happens after
publishing: Highlight changes shows nothing under the bar. Discarding the
period's drafts also brings their published shifts back while they're still
Away, hidden under the bar, and staff keep seeing them.

## Fix

1. An Away bar whose days hold draft changes keeps its Away look plus a dashed
   draft outline and a chip per kind at its corner in the change-chip style
   ("Removed ×3", "Changed ×2", "New ×4"; one day shows the word alone).
   Hovering or focusing the bar lists each day's change as Before and After,
   says it isn't published yet and that staff still see the published day.
2. Highlight changes: the bar carries the published chips the same way, and
   its card says the change was published.
3. The "Away all period" group, folded, says how many unpublished changes its
   people have in the period.
4. The other-periods banner names whose status changes a period's drafts come
   from: "11/22 - 12/5 (3) · Laura Marshall Away", "(5) · includes Laura
   Marshall Away", two names joined with "and", three or more as "3 people".
5. Discard leaves a status change's own drafts: a cell on a day its person
   can't be scheduled (`employee_schedulable_on`) is skipped by
   `discard_schedule_drafts` (migration 143). The discard confirmation names
   whose Away changes stay and how to undo them (change their status).

Already handled, no change: open requests on Away days close when someone is
marked Away (103, 116), and the confirmation says so; Month view and the
phone-width Day view draw no Away bar.

## Build steps

- [x] Shared logic: the changes under an Away bar (per day, per kind, chip
      text) and the banner's status suffix, with tests.
- [x] Grid: marked bar, chips and its card; published chips under Highlight
      changes; the folded group's count. Tests.
- [x] Banner suffix in the schedule page.
- [x] Migration 143: Discard skips unschedulable days. Integration test,
      checksum. The discard confirmation names whose Away changes stay.
- [x] Docs, browser evidence (Calm Haven, QA account), full checks.

## Production

Migration 143 changes `discard_schedule_drafts`. The release that carries it
stops for the owner to apply it (`internal/operations/production-migration-safety.md`).

## Evidence

- Tests: `awayRunChanges.test.ts` (chips per kind, the screen-reader summary),
  `draft-utils` tests (whose Away a period's drafts are, the banner suffix,
  the drafts a discard keeps and its line), `ScheduleGrid.test.tsx` (a marked
  bar with its chip, label and card, a plain bar beside it, a published chip
  under Highlight changes, the folded group's count), and
  `migration-143-discard-keeps-status-drafts.integration.test.ts` (Away days'
  drafts survive a discard, others don't; it fails without 143).
- Browser, local Calm Haven with a temporary employee marked Away over
  published Day Shifts (removed afterwards): the bars read **Removed ×2** and
  **Removed ×3** with a dashed outline; the card lists each day's Before (Day
  Shift · Supervisor, 7:00 AM - 3:30 PM) and After (No shift); the banner
  reads "(6) · Thomas Crawford Away" and "(16) · includes Diane Patterson
  Away"; the discard dialog counts nothing to discard and says "Avery
  Testaway's Away changes stay. Change their status to undo them."
- The bar's card reads the whole published cell (`publishedCellStateForKey`),
  since a pending removal reports no published parts.
- Type-check, lint, `docs:check`, `db:migrations:check` pass. Docs:
  schedule grid, draft and publish.
