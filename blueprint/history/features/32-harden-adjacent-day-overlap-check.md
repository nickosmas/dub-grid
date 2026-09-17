# Feature: Harden the adjacent-day overlap check for scheduler open-shift staffing

**From build-plan:** feature 32
**Status:** verified

## Goal

`checkCrossDateOverlap`'s adjacent-day guard (feature 22) reads the
neighbouring day from the loaded `shifts` map. A date outside the loaded
window is indistinguishable from a day with no shift, so the guard would
silently answer "no conflict" for an employee who in fact has an overnight
shift there. The plan asked to either guarantee the neighbour is loaded or
surface an explicit "can't verify" state instead of a false negative.

## What was found

The false negative is real in the code but not reachable through the UI
today. The loaded window is always ±90 days around today, only ever
widens, and when it recentres it keeps a
`FETCH_WINDOW_RECENTER_BUFFER_DAYS = 90` buffer past the visible range. An
open shift the scheduler can click is inside the visible range, so both of
its neighbours are inside the loaded window by at least 89 days. Nothing
encoded that, though: `hasAdjacentDateConflict` returned `false` for a
missing entry, and shrinking the buffer would have reintroduced the silent
miss with no test to catch it.

## The fix

Both halves of the plan's ask, kept proportionate to a latent defect:

- **Verify.** `SchedulePageClient` now checks the previous and next date
  keys against `loadedShiftWindow` and passes
  `adjacentDaysLoaded: { previous, next }` into the candidate builder
  (`loadedShiftWindow` joins the memo's dependencies).
- **Surface.** `buildOpenShiftStaffingCandidates` sets
  `adjacentCheckUnverified` on every candidate when either neighbour is
  not loaded. Candidates stay listed - excluding them would trade a false
  negative for a false positive - and `OpenShiftStaffingModal` shows a
  warning `SectionNotice` saying the overnight check could not run for
  that date. The input defaults to "loaded" when omitted, so existing
  callers and tests keep their behavior.

## Tests

- `open-shift-staffing.test.ts`: new case covering loaded, omitted,
  previous-missing and next-missing, asserting candidates remain and the
  flag is set only for the missing cases (12/12).
- `OpenShiftStaffingModal.test.tsx`: fixtures carry the new field; new
  cases assert the notice is absent when checked and present when not
  (9/9).
- `tsc --noEmit` clean, eslint clean, prettier clean.

## Files / areas

- `apps/web/src/app/(app)/schedule/_lib/open-shift-staffing.ts`
- `apps/web/src/app/(app)/schedule/_lib/open-shift-staffing.test.ts`
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`
- `apps/web/src/components/schedule/OpenShiftStaffingModal.tsx`
- `apps/web/src/components/schedule/OpenShiftStaffingModal.test.tsx`
