# Feature: People and People-detail state coverage

**From build-plan:** feature 25d1b2
**Status:** verified

## Goal

`/people` and `/people/[id]`'s manifest entries list `loading`, `error`,
`not found`, `drawers`, and `dialogs` (varying by route) as
`sourceReviewedStates`. Tracing the actual components:

- **`/people/[id]` not found** - real and deterministic:
  `PersonDetailRoute` (`page.tsx:71`) calls `notFound()` when the URL segment
  isn't a UUID. No data fetch needed to trigger it.
- **`/people` loading / error** - real, and the exact same shape as
  `/dashboard`'s (25d1a): `PeoplePageContent.tsx`'s `PeopleContent` renders
  `<ProgressBar loading={isLoading} />` while `useOrganizationData()` /
  `useEmployees()` load, and `loadError && !org` renders
  `OrganizationBootstrapRecovery` (`:82-96`) - the identical component
  `/dashboard` already proved reachable, just gated by this route's own
  `useOrganizationData()` call, so it needs its own test, not a citation of
  `/dashboard`'s (the manifest tracks evidence per route).
- **`/people` drawers** - real, once traced through an extra layer:
  `StaffView.tsx` renders `MembersSection.tsx` for the "directory" section,
  and `MembersSection.tsx` opens `StaffDetailPanel` (or
  `StaffReadOnlyDetailPanel`, by permission) when a roster row is clicked
  (`expandedEmpId` state, `:216,979,2058`).
- **`/people` dialogs** - real: `AddEmployeeModal`, opened from
  `PeoplePageContent.tsx`'s "Add" action (`:118,145-155`).
- **`/people/[id]` loading** - real, same `<ProgressBar>` pattern
  (`StaffDetailPage.tsx:698-722`), driven by `fetchEmployeeById` - one of
  several actions multiplexed through a single `POST /api/employees/manage`
  endpoint (`action` field in the request body), so the test must inspect
  the body to delay only that action.
- **`/people/[id]` dialogs** - real: `InviteEmployeeModal`, opened from an
  "Invite"-type action (`:924,1051-1057`).
- **`/people/[id]` error** - looks unreachable, but less certain than
  `/schedule`'s case: no `OrganizationBootstrapRecovery`-style fallback and
  no throw found in a first pass, but `StaffDetailPage.tsx` is large
  (700+ lines) and wasn't read in full. Step 6 does one more targeted check
  before concluding this the way Step 1 did for `/schedule` in 25d1b1.

## In scope

- Add Playwright coverage for all seven real states listed above (six
  concrete + `/people/[id]`'s not-found), across `e2e/typography.spec.ts` or
  a new `e2e/people-states.spec.ts` (decide during Step 1, consistent with
  the file either way).
- Resolve `/people/[id]`'s `error` claim the same way 25d1b1 resolved
  `/schedule`'s: confirm unreachable and correct the manifest, or find a
  real trigger and test it.
- Update the manifest as each state gets real coverage.

## Out of scope

- `/schedule`'s state coverage - already done (25d1b1).
- Role/permission variance in which panel opens for the "drawers" state
  (`StaffDetailPanel` vs `StaffReadOnlyDetailPanel`) - qa-super-admin's
  variant is enough to prove the class works; role variance generally is
  25d2's job for the whole epic, not this feature's.
- Every dialog/modal each route can open (People has several: bulk import,
  management access, add-to-schedule, etc.) - one representative dialog per
  route is enough to demonstrate the class, matching 25d1b1's precedent.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Cover `/people/[id]`'s not-found state.** Add a test that
      navigates to `/people/not-a-real-id` (or any non-UUID string) and asserts
      the not-found boundary's rendered content
      (`apps/web/src/app/(app)/people/not-found.tsx`'s title/message). _Done
      when_ the test passes and the manifest moves `"not found"` to
      `browserStates` for `/people/[id]`.
- [x] **Step 2 - Cover `/people`'s loading state.** Same technique as
      `/dashboard` (25d1a): delay `/api/organization/bootstrap`, navigate to
      `/people`, assert `[data-progress-bar]` is visible then gone. _Done when_
      the test passes and the manifest moves `"loading"` to `browserStates` for
      `/people`.
- [x] **Step 3 - Cover `/people`'s error state.** Same technique as
      `auth-degraded-network-recovery.spec.ts`'s bootstrap-failure test, applied
      to `/people` specifically: mock `/api/organization/bootstrap` to fail,
      navigate to `/people`, assert `OrganizationBootstrapRecovery`'s rendered
      UI. _Done when_ the test passes and the manifest moves `"error"` to
      `browserStates` for `/people`.
- [x] **Step 4 - Cover `/people`'s drawers state.** Click a roster row in
      the People directory and assert the detail panel (`StaffDetailPanel` or
      `StaffReadOnlyDetailPanel`) opens with that employee's info, then closes.
      _Done when_ the test passes and the manifest moves `"drawers"` to
      `browserStates` for `/people`.
- [x] **Step 5 - Cover `/people`'s dialogs state.** Open `AddEmployeeModal`
      via the People page's "Add" action and assert it renders and closes.
      _Done when_ the test passes and the manifest moves `"dialogs"` to
      `browserStates` for `/people`.
- [x] **Step 6 - Cover `/people/[id]`'s loading and dialogs; resolve its
      error claim.** Delay the `fetchEmployeeById` action specifically (inspect
      the intercepted `POST /api/employees/manage` request body's `action`
      field - other actions on the same endpoint must not be delayed) and
      assert `[data-progress-bar]` during the wait. Open `InviteEmployeeModal`
      via its trigger and assert it renders and closes. Before writing either
      test, do one more targeted check of `StaffDetailPage.tsx` in full (it
      wasn't read end-to-end during spec'ing) for any throw or
      `OrganizationBootstrapRecovery`-style fallback this spec's Goal section
      missed; if none exists, remove `"error"` from `/people/[id]`'s
      `sourceReviewedStates` with a comment explaining why, mirroring 25d1b1's
      Step 1. If one exists, test it instead of removing the claim. _Done when_
      loading and dialogs tests pass, the error claim is resolved one way or the
      other, and `/people/[id]`'s `sourceReviewedStates` is empty.

## Files / areas

- `e2e/typography.spec.ts` or new `e2e/people-states.spec.ts`
- `e2e/typography-route-manifest.ts`
- `apps/web/src/components/staff-detail/StaffDetailPage.tsx` (read-only,
  read in full during Step 6)

## Data / contracts

None - this adds test coverage and, possibly, corrects one manifest
documentation claim. No product code, type, or stored shape changes are
expected. If Step 6 finds a real `/people/[id]` error trigger this spec
didn't anticipate, flag it rather than improvising a fix.

## Testing

- This feature's product _is_ test coverage, same as 25d1a and 25d1b1. Each
  step's "done when" is a passing Playwright test or a verified manifest
  correction.
- Run the manifest's coverage-shape test after each manifest edit.
- Run each new test 2-3 times consecutively before calling a step done -
  25d1b1's loading-state test needed this to catch a real flakiness source
  (Next's Link prefetch racing the test's own navigation).

## Notes for the AI

- Reuse established patterns from this epic rather than reinventing them:
  the `data-progress-bar` marker (25d1a), the bootstrap-delay/bootstrap-fail
  techniques for loading/error (25d1a, `auth-degraded-network-recovery.spec.ts`),
  and the investigate-before-testing discipline for uncertain claims
  (25d1b1's Step 1).
- Step 6's multiplexed-endpoint mock (matching on the request body's
  `action` field, not just the URL) is a new pattern for this epic - other
  actions on `/api/employees/manage` must pass through untouched, or
  unrelated page functionality could break mid-test.
- Don't force a synthetic error trigger for `/people/[id]` if Step 6 confirms
  none exists - an honest manifest correction is the fix, not manufactured
  product code whose only purpose is passing a test.
