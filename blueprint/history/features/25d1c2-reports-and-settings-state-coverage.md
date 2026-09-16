# Feature: Reports and Settings state coverage

**From build-plan:** feature 25d1c2
**Status:** verified

## Goal

`/reports`'s manifest entry lists `loading`, `error`, `empty`, and
`popovers`; `/settings` lists `loading`, `error`, `not found`, and
`dialogs`, all as `sourceReviewedStates`. Tracing the actual components:

- **`/reports` loading** - `ReportsPageContent.tsx:909` renders
  `<ProgressBar loading={isLoading || reportsQuery.isFetching} />`.
  `reportsQuery` runs `fetchOperationsReport` =
  `GET /api/reports/operations?...` (`features/reports/client/api.ts:86`)
  once "Generate report" (`:967-970`, `handleGenerateReport`) sets
  `appliedRequest`. Delaying that endpoint after clicking Generate holds the
  bar on screen. The same endpoint also serves `targetOptionsQuery` (the
  target dropdown options, `:766-773`); a URL-level mock affects both, which
  is fine for loading/error/empty because only `reportsQuery` drives the
  states asserted here.
- **`/reports` error** - `:1248-1253`: `appliedRequest && reportsQuery.error`
  renders `EmptyState` with heading
  `formatClientErrorMessage(reportsQuery.error, "Failed to load reports")`.
  A 500 with `{ error: "..." }` after Generate reaches it, and the mocked
  message surfaces as the heading.
- **`/reports` empty** - `:1298-1308`: a successful report with no visible
  rows renders `EmptyState` (`data-testid="reports-empty-state"`) whose
  heading is the report's `emptyText` from `features/reports/shared/table.ts`
  ("No staff records found." for the default staff report). Fulfilling the
  endpoint with a valid, empty operations payload reaches it without
  depending on which weeks are seeded.
- **`/reports` popovers** - real Base UI popovers: `ReportRangePicker`
  (`:1020`, trigger `aria-label="Date range"`, `aria-haspopup="dialog"`) and
  each `TargetDropdown` (`:1023-1142`, triggers `aria-label="Focus areas"`,
  `"People"`, `"Shift categories"`, `"Jobs"`). One of each class is enough.
- **`/settings` loading** - `settings/page.tsx`: while `useOrganizationData`
  loads, `<ProgressBar loading />` plus `SettingsPageSkeleton` (`<main
aria-busy="true" aria-label="Loading settings">`) render. Delaying
  `/api/organization/bootstrap` (25d1a/25d1b2's technique) holds both.
- **`/settings` error** - `settings/page.tsx`: `loadError && !org` renders
  `OrganizationBootstrapRecovery`, the same component `/people` and
  `/dashboard` already proved reachable, gated by this route's own hook
  call. Failing the bootstrap reaches it.
- **`/settings` dialogs** - real: `ConfirmDialog`s in
  `components/settings/Indicators.tsx:410` (archive an indicator),
  `AbsenceTypes.tsx:477-515`, and `DangerZone.tsx:127` (delete the
  organization). The indicator archive confirm is the representative one:
  it's reachable from `?section=staff-indicators` and cancelling it mutates
  nothing. `DangerZone` is deliberately not exercised.
- **`/settings` not found** - looks unreachable, same shape as `/schedule`'s
  claim in 25d1b1: no `notFound()` call exists under
  `app/(app)/settings/**` or `components/settings/**`, and the only child
  route, `settings/staff-config/page.tsx`, is a `redirect()`. A URL like
  `/settings/does-not-exist` matches no segment, so Next renders the root
  `app/not-found.tsx`, not `settings/not-found.tsx`. Step 8 confirms this
  live before correcting the manifest.

## In scope

- Playwright coverage for the seven real states, in two new files:
  `e2e/reports-states.spec.ts` and `e2e/settings-states.spec.ts`.
- Resolve `/settings`'s `not found` claim the way 25d1b1 resolved
  `/schedule`'s: confirm unreachable and correct the manifest with a comment,
  or find a real trigger and test it.
- Update `e2e/typography-route-manifest.ts` as each state gets real
  coverage, ending with `sourceReviewedStates: []` for both routes. This
  closes 25d1c and, with it, 25d1.

## Out of scope

- Route-level `loading.tsx` fallbacks and `error.tsx` boundaries (same
  reading as 25d1b1 and 25d1c1).
- Every popover and dialog on these pages: one date-range popover, one
  target dropdown, and one settings confirm dialog demonstrate the classes.
- `DangerZone`'s delete-organization confirm (destructive even to open
  carelessly; the class is proven by the indicator confirm).
- Export (`/reports` "Export" button) and any report content correctness.
- Role variance in which settings sections appear - 25d2.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Cover `/reports`'s popovers.** In a new
      `e2e/reports-states.spec.ts`, open the "Date range" trigger and assert
      its popover dialog is visible, close it with Escape, then do the same
      for the "Focus areas" target dropdown. _Done when_ the test passes 3
      runs in a row and the manifest moves `"popovers"` to `browserStates`
      for `/reports`.
- [x] **Step 2 - Cover `/reports`'s loading state.** Delay
      `**/api/reports/operations*`, click "Generate report", and assert
      `[data-progress-bar]` is visible and then gone. _Done when_ the test
      passes 3 runs in a row and the manifest moves `"loading"` to
      `browserStates`.
- [x] **Step 3 - Cover `/reports`'s error state.** Fulfill the same endpoint
      with a 500 `{ error: "Temporary test failure" }` after Generate and
      assert the `EmptyState` heading carries that message. _Done when_ the
      test passes and the manifest moves `"error"` to `browserStates`.
- [x] **Step 3a - Repair the stacked empty states on report failure.**
      Found by Step 3: with `reportsQuery.error` set, `ReportsPageContent.tsx`
      rendered the error `EmptyState` _and_ the report section's fallback
      `EmptyState` headed "Loading reports" (its `preview` is null). Gate the
      report section on `!reportsQuery.error`. Decision: user chose to fix it
      here rather than log a finding. _Done when_ Step 3's test asserts
      `[data-testid="reports-empty-state"]` is absent during the error and
      `ReportsPageContent.test.tsx` still passes.
- [x] **Step 4 - Cover `/reports`'s empty state.** Read the operations
      report response type (`features/reports/client/api.ts` and
      `features/reports/shared`) to build a valid empty payload, fulfill the
      endpoint with it after Generate, and assert
      `[data-testid="reports-empty-state"]` with the default report's
      `emptyText`. _Done when_ the test passes and `/reports`'s
      `sourceReviewedStates` is empty.
- [x] **Step 5 - Cover `/settings`'s loading state.** In a new
      `e2e/settings-states.spec.ts`, delay `/api/organization/bootstrap`,
      navigate to `/settings`, and assert `[aria-label="Loading settings"]`
      (or `[data-progress-bar]`) is visible and then gone. _Done when_ the
      test passes 3 runs in a row and the manifest moves `"loading"` to
      `browserStates` for `/settings`.
- [x] **Step 6 - Cover `/settings`'s error state.** Fail the bootstrap with
      a 503 and assert `OrganizationBootstrapRecovery`'s heading and "Try
      again" button, exactly as `people-states.spec.ts` does for `/people`.
      _Done when_ the test passes and the manifest moves `"error"` to
      `browserStates`.
- [x] **Step 7 - Cover `/settings`'s dialogs state.** Navigate to
      `/settings?section=schedule-absence-types` (the Calm Haven QA org has
      no indicators, so `AbsenceTypes.tsx`, which shares the exact same
      row-editor + Delete + `ConfirmDialog` pattern, is the representative
      instead), open one row's Delete action, assert the `ConfirmDialog`
      naming that row is visible, and cancel it; assert the row is still
      listed. _Done when_ the test passes and
      the manifest moves `"dialogs"` to `browserStates`.
- [x] **Step 8 - Resolve `/settings`'s not-found claim.** Resolved:
      `/settings/does-not-exist` renders the root boundary ("404 / This page
      could not be found." / "Go Home"), confirmed live in the browser as
      `qa-super-admin`; the claim was removed with a manifest comment. Visit
      `/settings/does-not-exist` and record which boundary renders (the root
      `app/not-found.tsx` copy vs `settings/not-found.tsx`'s "Settings page
      not found"). If it's the root boundary, remove `"not found"` from
      `/settings`'s `sourceReviewedStates` with a comment explaining why,
      mirroring 25d1b1. If `settings/not-found.tsx` renders, test that
      instead. _Done when_ the claim is resolved either way, `/settings`'s
      `sourceReviewedStates` is empty, and the manifest shape test passes.

## Files / areas

- New: `e2e/reports-states.spec.ts`, `e2e/settings-states.spec.ts`
- `e2e/typography-route-manifest.ts`
- Read-only: `apps/web/src/app/(app)/reports/ReportsPageContent.tsx`,
  `apps/web/src/app/(app)/settings/page.tsx`,
  `apps/web/src/components/settings/Indicators.tsx`,
  `apps/web/src/features/reports/client/api.ts`,
  `apps/web/src/features/reports/shared/table.ts`

## Data / contracts

None - test coverage and manifest bookkeeping only. Step 4's empty payload
must match the real `OperationsReport` response shape, read from the types,
not guessed. If a step finds a real defect, flag it for a decision rather
than patching product code inside this feature.

## Testing

- This feature's product _is_ test coverage. Each step's "done when" is a
  passing Playwright test or a verified manifest correction.
- Run each new test 3 times consecutively before calling a step done.
- Run the manifest shape test (`typography audit manifest owns explicit
evidence for every route state`) after each manifest edit.

## Notes for the AI

- Reuse the epic's patterns: `loginAsQaSuperAdmin`, the `[data-progress-bar]`
  marker, and the delay/fail/fulfill `page.route` techniques from
  `people-states.spec.ts` and `alerts-states.spec.ts`.
- `EmptyState` headings are styled text, not `<h*>` elements (25d1c1 Step 2
  found this); assert with `getByText`, not the `heading` role.
- The reports endpoint is shared by the target-options query; a mock that
  fails or empties it also empties the target dropdowns. That's acceptable
  for these assertions but means Step 1 (popovers) should not run under a
  mock.
- Never open `DangerZone`'s confirm in a test; cancelling an indicator
  archive is the safe representative dialog.
- Don't force a synthetic not-found trigger. If Step 8 confirms the root
  boundary handles `/settings/*`, the honest fix is the manifest comment.
