# Feature: Dashboard state coverage

**From build-plan:** feature 25d1a
**Status:** verified

## Goal

`e2e/typography-route-manifest.ts`'s `/dashboard` entry lists `loading`,
`error`, `empty cards`, and `trial overlay` as `sourceReviewedStates` -
verified by reading `DashboardPageContent.tsx`/`DashboardView.tsx`'s source,
not by a live browser check. This feature adds Playwright coverage that
actually drives each state and asserts on it, moving all four into
`browserStates`, and fixes any real defect the live check surfaces along the
way. This is the first of three sibling sub-features (25d1a-25d1c) doing the
same conversion for different route clusters; 25d1a proves the pattern on
the highest-traffic route first.

Traced the actual triggers in `DashboardPageContent.tsx`:

- **loading** - `<ProgressBar loading />` while `perms.isLoading` or the
  combined `refLoading || empLoading || perms.isLoading` from
  `useOrganizationData()` / `useEmployees()` (`:59,68,82`).
- **error** - `loadError && !org` renders `OrganizationBootstrapRecovery`
  instead of the dashboard (`:71-78`). `loadError` comes from
  `useOrganizationData()`, which calls `/api/organization/bootstrap`
  (`queryKeys.org.bootstrap()`).
- **empty cards** - the dashboard's cards (coverage, open shifts, activity,
  staff hours) render their own empty-state UI when their backing data is
  zero-length; which query(ies) feed each card needs confirming during the
  step, since `DashboardView`'s several card components each read different
  slices of `useOrganizationData()`'s / `useEmployees()`'s payload.
- **trial overlay** - `TrialWelcomeModal` (rendered by `AppShell`, not
  `DashboardPageContent` itself) queries `/api/trial-welcome` and shows when
  `data.shouldShowWelcome` is true (`TrialWelcomeModal.tsx:56-76`).

## In scope

- Add Playwright test coverage (in `e2e/typography.spec.ts` or a new
  `e2e/dashboard-states.spec.ts`, whichever keeps the diff smaller - decide
  during Step 1) that drives and asserts on `/dashboard`'s loading, error,
  empty-cards, and trial-overlay states as `qa-super-admin`.
- Update `typography-route-manifest.ts`'s `/dashboard` entry: move each
  state from `sourceReviewedStates` to `browserStates` once it has real
  coverage.
- Fix any defect the live check surfaces (a broken empty state, a stuck
  loading spinner, a trial overlay that doesn't dismiss, etc.) as part of
  this feature, not deferred.

## Out of scope

- Every other route's `sourceReviewedStates` - `/schedule`/`/people`/etc.
  are 25d1b, `/profile`/`/reports`/`/alerts`/`/settings` are 25d1c.
- Role/permission variance (does an Admin or User see the same dashboard
  states correctly) - that's 25d2, which re-runs whatever this feature
  builds across other roles.
- The Gridmaster portal's own dashboard-adjacent rendering
  (`DashboardPageContent.tsx:116-118` routes gridmaster users to
  `GridmasterPortal`, not `DashboardContent`) - that's 25d3.
- Preferring mocked network responses over new seeded QA fixtures wherever
  a state can be triggered that way (see Notes for the AI) - if a state
  genuinely can't be reached without a new fixture, flag it for a decision
  rather than silently adding one.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Cover the loading state.** Add a Playwright test that
      intercepts `/api/organization/bootstrap` (or the relevant employees
      query) with an artificial delay, navigates to `/dashboard`, and asserts
      the `<ProgressBar loading />` indicator is visible before the dashboard
      content renders, then disappears once data resolves. _Done when_ the test
      passes, `/dashboard`'s manifest entry gains `"loading"` in `browserStates`
      and drops it from `sourceReviewedStates`, and the manifest's own
      coverage-shape test (`typography.spec.ts`'s "owns explicit evidence" test)
      still passes.
- [x] **Step 2 - Confirm the error state already has coverage; update the
      manifest.** `e2e/auth-degraded-network-recovery.spec.ts`'s "Calm Haven
      cold bootstrap recovers in place after exhausted 503 responses" test
      already does this: it logs in (landing on `/dashboard`, per
      `POST_LOGIN_DESTINATION`), mocks `/api/organization/bootstrap` to return
      503 repeatedly, reloads, and asserts `OrganizationBootstrapRecovery`'s
      rendered UI (the "Loading your workspace" heading and an enabled "Try
      again" button) - this is exactly `/dashboard`'s error state. No new test
      needed. _Done when_ the manifest's `/dashboard` entry moves `"error"` from
      `sourceReviewedStates` to `browserStates`, with a short comment or note
      pointing at the existing spec file as the evidence source, and the
      manifest's coverage-shape test still passes.
- [x] **Step 3 - Cover the empty-cards state.** Identify which query(ies)
      back the dashboard's coverage, open-shifts, activity, and staff-hours
      cards, mock them to return empty/zero-length data, navigate to
      `/dashboard`, and assert each card's empty-state UI renders correctly
      (no broken layout, no stray "undefined" text, appropriate empty-state
      copy). _Done when_ the test passes and the manifest is updated.
- [x] **Step 4 - Cover the trial overlay.** Add a test that intercepts
      `/api/trial-welcome` to return `{ shouldShowWelcome: true, ... }` (match
      whatever shape the real endpoint returns - check its route handler),
      navigates to `/dashboard`, and asserts `TrialWelcomeModal` renders and can
      be dismissed. _Done when_ the test passes and the manifest is updated,
      completing all four states for `/dashboard`.

## Files / areas

- `e2e/typography.spec.ts` or new `e2e/dashboard-states.spec.ts`
- `e2e/typography-route-manifest.ts`
- Whichever app source file(s) Steps 1-4 find a real defect in (unknown
  until the live check runs)

## Data / contracts

None expected - this adds test coverage and mocks existing endpoints' known
response shapes; it doesn't change any endpoint, type, or stored shape. If a
found defect's fix requires a contract change, flag it before proceeding
rather than improvising one.

## Testing

- This feature's product _is_ test coverage - each step's "done when" is a
  passing Playwright test, run via
  `npx playwright test <file> --project=chromium` (matching CI's default;
  cross-browser is 25c's already-verified territory, not re-litigated here).
- After all four steps, run `e2e/typography.spec.ts`'s "owns explicit
  evidence" test to confirm the manifest's shape rules still hold (every
  route needs at least one `browserStates` entry, no duplicate state across
  both arrays).
- If a step's live check finds a real product defect, fix it in the
  smallest way that satisfies the existing behavior, and note the fix
  separately from the test-coverage diff in that step's summary.

## Notes for the AI

- Prefer Playwright network-route mocking (`page.route(...)`) to trigger a
  state deterministically over adding new seeded QA data - it's faster,
  doesn't touch the shared local Supabase instance, and doesn't risk
  colliding with another concurrent session's use of the same seed data
  (this is a shared checkout - see `AGENTS.md`). Only propose a new fixture
  if a state genuinely can't be reached by mocking, and flag that decision
  rather than adding one silently.
- Match the existing `auditRenderedTypography` helper's patterns
  (`typography.spec.ts`) where useful (theme toggling, viewport sizing) but
  don't force these state checks through that exact helper if a simpler,
  purpose-built assertion reads clearer - this feature's job is state
  correctness, not the typography contract that helper already verifies.
- Keep each step's test isolated: don't let Step 3's mocked empty data leak
  into Step 4's trial-overlay test or vice versa - use fresh `page.route`
  interceptors scoped per test.
