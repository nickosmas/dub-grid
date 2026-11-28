# Feature: Work-limit warnings at request approval on web

**From build-plan:** feature 60c1
**Status:** verified
**Branch:** `feature/60c1-approval-work-limits` (cut from `origin/dev` at 36a3e4167)

## Goal

Every web approval (the requests board, the shift panel and the dashboard
queue) warns, without blocking, when approving a pickup or swap would give
the person who gets the shift more than 5 days in a row, more than 5 days
in a Sunday-to-Saturday week, or more than 40 hours in that week.

## Decisions

- Owner, 2026-11-27: warn, never block; on screen only; mobile approvals
  are 60c2.
- Chosen here: counted on the server from the published schedule, since an
  approval publishes at once; drafts never count. A volunteer gains the open
  shift, a pickup gives the asker's shift to the person picking it up, a
  swap trades the two shifts (each side gives up its own day). A call-off
  gives nobody a shift. Only people who gain a shift are checked.
- Wording: "Approving gives Carol Henderson 59.5 hours in the week of Sun,
  Nov 22." in the approval's existing warning, after the unpublished-draft
  lines. A failed check adds nothing and never blocks the approval.
- The limit wording moved into `@dubgrid/schedule-core`
  (`describeWorkLimit`), so the publish list (60b), web approvals and the
  mobile app (60c2) read the same.

## Build steps

- [x] **Step 1 - Shared check** - `requestDayChanges`,
      `requestWorkLimitBreaks`, `describeWorkLimit` and
      `describeApprovalWorkLimits` in `packages/schedule-core/src/request-work-limits.ts`,
      with tests; `scheduleStateHours` moved out of the mobile dashboard into
      `hours-assembly.ts` so both read cell hours one way.
- [x] **Step 2 - Server loader and action** - `loadRequestWorkLimits` in
      `apps/web/src/features/schedule/server/request-work-limits.ts` and the
      approver-only `fetchShiftRequestWorkLimits` action on
      `/api/schedule/requests`, with route tests.
- [x] **Step 3 - Web approvals** - `loadApprovalDraftWarning` fetches the
      draft cells and the work limits together, so the board, the shift panel
      and the dashboard queue all show the lines; board test.

## Evidence

- Unit: schedule-core `request-work-limits.test.ts` (10) and
  `scheduleStateHours` (3); mobile-api-core suite (332) unchanged after the
  move; route tests (18); `ShiftRequestBoard.test.tsx` (24).
- Browser (local Calm Haven): a pending pickup of Richard's Nov 28 evening
  shift by Carol showed "Approving gives Carol Henderson 59.5 hours in the
  week of Sun, Nov 22." with Approve enabled. The first run returned 500
  ("permission denied for table shift_categories") because the loader used
  the browser-side `lib/db` helpers; it now reads through
  `fetchAssignmentContext` with the service client. The test request was
  deleted unapproved.

## Files / areas

- `packages/schedule-core/src/request-work-limits.ts`, `hours-assembly.ts`
  and tests; `packages/mobile-api-core/src/dashboard.ts`
- `apps/web/src/features/schedule/server/request-work-limits.ts`
- `apps/web/src/app/api/schedule/requests/route.ts` and test
- `apps/web/src/features/schedule/client/api.ts`
- `apps/web/src/components/shift-requests/approval-draft-warning.tsx`
- `apps/web/src/app/(app)/schedule/_components/PublishChangeSummary.tsx`
  (wording now from schedule-core)
- `apps/web/src/__tests__/ShiftRequestBoard.test.tsx`
- `docs/features/shift-requests.mdx`
