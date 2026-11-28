# Feature: Work-limit warnings at request approval in the mobile app

**From build-plan:** feature 60c2
**Status:** verified
**Branch:** `feature/60c2-mobile-approval-work-limits` (cut from `origin/dev` at 5edc48569)

## Goal

The mobile app's approval warns the same way as the web (60c1): approving
a pickup or swap that gives the person who gets the shift more than 5 days
in a row, more than 5 days in a Sunday-to-Saturday week, or more than 40
hours in that week shows "Approving gives Carol Henderson 59.5 hours in the
week of Sun, Nov 22." in the approval sheet. Approve stays available.

## Decisions

- Owner, 2026-11-27: mobile approvals are in scope; warn, never block.
- Chosen here: the requests payload carries `workLimits` on each request
  awaiting approval, beside `draftCells`, for approvers only, so the sheet
  shows it as soon as it opens, as the draft warning does. The server
  checks all pending requests in one batch (`loadRequestsWorkLimits`: one
  read of the assignments and one of each person's published days). A
  failed check is `null` and warns about nothing; an older server leaves
  the field absent. The wording is 60c1's, from `@dubgrid/schedule-core`.

## Build steps

- [x] **Step 1 - Batch loader** - `loadRequestsWorkLimits` in
      `apps/web/src/features/schedule/server/request-work-limits.ts`;
      `loadRequestWorkLimits` (web, 60c1) now calls it for one request.
- [x] **Step 2 - Contract and payload** - optional nullable `workLimits` on
      the mobile shift request; `loadMobileShiftRequestsPayload` takes an
      optional `loadRequestsWorkLimits` and attaches it for approvers; the
      mobile route passes it. Tests in `mobile-api-core`.
- [x] **Step 3 - Approval sheet** - `request-action-feedback.ts` adds the
      work-limit lines after the draft lines; test.

## Evidence

- Unit: `mobile-api-core` `shift-requests.test.ts` (15, two new),
  mobile `request-action-feedback.test.ts` (11, one new).
- API (local Calm Haven, worktree dev server, QA account signed in through
  the mobile login): with a pending pickup of Richard's Nov 28 evening shift
  by Carol, `GET /api/mobile/v1/shift-requests` returned the request with
  `workLimits: [{ name: "Carol Henderson", breaks: [{ limit: "hours",
hours: 59.5, start: "2026-11-22", end: "2026-11-28" }] }]`. The test
  request was deleted unapproved.
- Not run: the iOS Simulator. Metro can't start from a worktree; the sheet
  renders `feedback.warning`, which the unit test pins.

## Files / areas

- `apps/web/src/features/schedule/server/request-work-limits.ts`
- `apps/web/src/features/mobile/server/routes/shift-requests.ts`
- `packages/contracts/src/mobile.ts`
- `packages/mobile-api-core/src/shift-requests.ts` and test
- `apps/mobile/src/features/shift-requests/lib/request-action-feedback.ts`
  and test
- `docs/features/shift-requests.mdx`
