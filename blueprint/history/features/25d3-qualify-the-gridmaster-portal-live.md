# Feature: Qualify the Gridmaster portal live

**From build-plan:** feature 25d3
**Status:** verified

## Goal

`e2e/typography-route-manifest.ts`'s `/gridmaster` entry carries browser
evidence only for the authorization-gate redirect (a super admin is sent
to `/schedule`); its `portal`, `loading`, `error` and `not found` states
are `sourceReviewedStates`. 25d2a gave the suite `qa-gridmaster` and
`loginAsQaGridmaster`, and 25d2c drove the portal's Impersonation view
live, so the portal itself can now be qualified the way 25d1 qualified the
org routes: one state-coverage spec, each state evidenced in the browser
or explicitly resolved, and the manifest updated to say which.

Traced from the code (`GridmasterPortal.tsx`, the `(app)/gridmaster` route
files, `features/gridmaster/client/api.ts`):

| State       | Where it lives                                                                                                                                                                                                                                                                                                                        | Evidence plan                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `portal`    | `GridmasterPortal` renders a sidebar ("Gridmaster navigation") and one of 13 views: Dashboard, All Users, Billing, Compliance, Audit Log, Alerts, Impersonation, History, New Organization, Security, Kill Switches (`platform-flags`), Gridmaster Accounts, and the organization detail reached from the header org search or a list | sign in as `qa-gridmaster`, visit `/gridmaster`, assert the dashboard ("Platform Oversight"), then open every sidebar view and assert one marker each; open Calm Haven's detail and every tab; the collector stays empty                                                                               |
| `loading`   | `(app)/gridmaster/loading.tsx` is a `ProgressBar` on the dark ground; `GridmasterPortal.tsx:634` also renders `<ProgressBar loading />` while a view's data is in flight                                                                                                                                                              | delay `/api/gridmaster/dashboard` (the first view's fetch) and assert `[data-progress-bar]` appears then unmounts, exactly as `dashboard-states.spec.ts` does                                                                                                                                          |
| `error`     | `(app)/gridmaster/error.tsx` wraps the route in `ErrorBoundary`; whether any view throws to it, or catches into an inline state, is not yet traced                                                                                                                                                                                    | fail `/api/gridmaster/dashboard` with 503, read what renders; browser-evidence the state that exists (boundary copy or inline failure state). If no failure surfaces at all, that is a defect for Step 6, not a source-reviewed claim                                                                  |
| `not found` | `(app)/gridmaster/not-found.tsx` ("The Gridmaster page you're looking for doesn't exist.", "Back to Gridmaster") exists, but nothing under the route calls `notFound()` and there is no dynamic segment                                                                                                                               | visit `/gridmaster/does-not-exist` as the gridmaster and record which boundary renders (this file, or the app root's). If the route's own boundary is unreachable, resolve the manifest claim with a comment the way 25d1c2 resolved `/settings`, rather than leaving a state that nothing can trigger |

## In scope

- `e2e/gridmaster-portal-states.spec.ts`: the four states above as
  `qa-gridmaster`, with the console/403/5xx collector from
  `e2e/helpers/role-variance.ts` in every test.
- `e2e/typography-route-manifest.ts`: the `/gridmaster` entry moves each
  evidenced state from `sourceReviewedStates` to `browserStates` with a
  comment naming the spec, and records any resolved claim; the
  `route-redirect` expectation for the super admin stays, since the
  typography matrix still visits the route as `qa-super-admin`.
- Closing what the walk finds: a small in-scope fix with a test, or a
  recorded finding, decided with the user.

## Out of scope

- Mutations from the portal (activating accounts, suspending or archiving
  organizations, creating organizations, toggling kill switches, password
  resets): the contract here is what renders and what is reachable.
- The Impersonation view's start/end flow (25d2c) and the impersonated
  shell.
- Per-view loading/error/empty coverage for all 13 views: the manifest
  tracks the route's states; the walk asserts each view renders its
  loaded content once, and any view that fails to load is a finding.
- Mobile viewport chips (`dg-mobile-section-bar`); desktop sidebar only.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Portal renders: dashboard and the first six views.**
      (Green on the first honest run, 3 consecutive runs across the
      browsers, collector empty. Markers: "Platform Oversight", headings
      "All Users", "Billing Oversight", "Compliance Oversight", "Audit log",
      "Security Oversight", and "Inbox" for Alerts.) New
      `e2e/gridmaster-portal-states.spec.ts`. Sign in with
      `loginAsQaGridmaster`, visit `/gridmaster`, assert the sidebar
      (`nav[aria-label="Gridmaster navigation"]` or the desktop sidebar's
      "All Users" button) and the dashboard's "Platform Oversight"; then
      click All Users, Billing, Compliance, Audit Log, Alerts, Security and
      assert one loaded marker each, read from the view components
      (headings, table headers or the empty-state titles the seed produces).
      Collector empty. _Done when_ 3 green runs across the browsers.
- [x] **Step 2 - Portal renders: the remaining views and the org detail.**
      (Every view and tab rendered on the first honest run; the collector
      caught the CSP block repaired in Step 2b; 3 consecutive greens after
      that. Markers: "1. Select Organization", "Impersonation History",
      "Create Organization", the "Error Reporting" flag row, "Gridmaster
      Accounts", "Support Snapshot", then per tab "Organization Details",
      heading "Billing", "Organization role", "Employee ID", "Short code",
      "Organization Activity", "Expires", and the schedule table or its
      "No shifts found" empty state.)
      Same test file: Impersonation ("1. Select Organization"), History,
      New Organization, Kill Switches, Gridmaster Accounts; then the header
      org search for "Calm" → Calm Haven detail ("Support Snapshot") and
      each tab (Overview, Billing, Users, Employees, Configuration, Activity,
      Invitations, Schedule) renders. Update the manifest: `"portal"` moves
      to `browserStates` with a comment naming the spec. _Done when_ 3 green
      runs and `npx playwright test e2e/typography.spec.ts -g "manifest owns"`
      passes.
- [x] **Step 2b - Repair: the Places script is blocked by CSP.**
      (`middleware.test.ts` extended for both policies and `connect-src`,
      55/55 with the nonce-routes test; eslint, prettier, `tsc` clean;
      Step 2's walk 3x green with the collector strict.) Found by
      Step 2's collector on every browser: `google-maps.ts` injects
      `https://maps.googleapis.com/maps/api/js?...&libraries=places` for
      `OrganizationLocationFields` (portal New Organization wizard, org
      detail Overview, Settings > Organization Details), and neither
      `script-src` policy in `proxy.ts` allows that host, so local sessions
      never get the address autocomplete; production likely tolerates it
      only through `'strict-dynamic'`. Allow `https://maps.googleapis.com`
      and `https://maps.gstatic.com` explicitly in both policies and in
      `connect-src`, with the existing CSP test extended. Decided with the
      user: fix here. _Done when_ the CSP test passes and Step 2's walk is 3x
      green with the collector strict.
- [x] **Step 3 - Loading state.** (Green 3x3 on the first honest run;
      `GridmasterPortal.tsx:22` gates the bar on `dashboardQuery.isLoading`.)
      Delay `/api/gridmaster/dashboard` by 1.5s,
      visit `/gridmaster`, assert `[data-progress-bar]` visible then gone,
      then the dashboard marker. Manifest: `"loading"` to `browserStates`.
      _Done when_ 3 green runs.
- [x] **Step 4 - Error state.** (Green 3x3. The boundary is not what
      renders: `dashboardQuery`'s failure becomes the inline danger message
      at `GridmasterPortal.tsx:455` and `:1052` with the sidebar still
      usable, so that inline state carries the browser evidence and the
      manifest comment records why `error.tsx` is unreachable from a data
      failure.) Fulfil `/api/gridmaster/dashboard` with a
      503 and assert the failure state the portal actually renders (read
      `GridmasterDashboard.tsx` and its query hook first). If the route
      boundary is what renders, assert `ErrorBoundary`'s copy and its retry
      control; if an inline state renders, assert that. Manifest: `"error"`
      to `browserStates`, or resolved with a comment if the boundary is
      provably unreachable and an inline state carries the evidence. A
      silent failure (dashboard shows nothing and no error) is a finding.
      _Done when_ 3 green runs.
- [x] **Step 5 - Not-found state.** (Resolved: the app root's 404 renders
      ("This page could not be found.", "Go Home"); the route's own
      `not-found.tsx` is unreachable because nothing calls `notFound()` and
      there is no dynamic segment. The test pins the boundary that actually
      renders and asserts the route-local copy is absent; the manifest keeps
      `not found` source-reviewed with that reason; F-74 records the dead
      boundary file. 3x3 green.) Visit `/gridmaster/does-not-exist` and
      assert whichever boundary renders; if it is the route's own
      (`Back to Gridmaster`), move `"not found"` to `browserStates`; if it
      is the app root's, keep the state under `sourceReviewedStates` with a
      comment explaining the file is unreachable, as 25d1c2 did for
      `/settings`. _Done when_ 3 green runs and the manifest test passes.
- [x] **Step 6 - Close what the walk found.** (Every view and tab loaded;
      the one defect the collector caught, the CSP block on the Places
      loader, was repaired in Step 2b with the user's decision; the
      unreachable route-local not-found boundary is recorded as F-74. The
      manifest's `/gridmaster` entry now evidences `portal`, `loading` and
      `error` in the browser and keeps `not found` source-reviewed with the
      reason. Final evidence: `gridmaster-portal-states.spec.ts` 15/15
      across Chromium, Firefox and WebKit in one run after every test had 3
      consecutive greens; `typography.spec.ts` 6/6 on Chromium.) Any view
      that fails to load,
      any 403/5xx the collector records, or any silent failure: fix in an
      extra step or record a finding, decided with the user; if nothing,
      record that explicitly in the archive. _Done when_ every step is green
      and the manifest's `/gridmaster` entry has an empty
      `sourceReviewedStates` or only commented, resolved claims.

## Files / areas

- New: `e2e/gridmaster-portal-states.spec.ts`
- Modified: `e2e/typography-route-manifest.ts` (`/gridmaster` entry)
- Read-only: `apps/web/src/components/gridmaster/GridmasterPortal.tsx`,
  `apps/web/src/components/gridmaster/*View.tsx`,
  `apps/web/src/components/gridmaster/OrganizationDetail.tsx`,
  `apps/web/src/app/(app)/gridmaster/{loading,error,not-found}.tsx`,
  `apps/web/src/components/RouteBoundary.tsx`,
  `apps/web/src/features/gridmaster/client/api.ts`

## Data / contracts

None. The manifest entry is the contract; `typography.spec.ts`'s
"manifest owns explicit evidence" test enforces that every state is either
browser-evidenced or source-reviewed, never both, and that
`browserStates` is non-empty.

## Testing

- Each new test: 3 consecutive passing runs across Chromium, Firefox, and
  WebKit before its step is done.
- The collector from `e2e/helpers/role-variance.ts` in every test; a 403 or
  5xx from a portal view is a defect.
- `npx playwright test e2e/typography.spec.ts -g "manifest owns"` after
  every manifest edit.
- `npm run test:web` unaffected unless Step 6 changes product code.

## Notes for the AI

- The gridmaster signs in only on `gridmaster.localhost`
  (`loginAsQaGridmaster`, `QA_GRIDMASTER_ORIGIN`); the portal lives at
  both `/dashboard` and `/gridmaster` on that host.
- The portal header has its own org search ("Search organizations...") and
  org chip; scope view-level locators to the `Gridmaster content` region
  (aria-label) as 25d2c did.
- Desktop sidebar items are buttons named by label ("All Users", "Kill
  Switches", "Gridmaster Accounts"); the mobile chips use different labels
  and are out of scope.
- Views are `next/dynamic` chunks: assert their loaded marker with a
  generous timeout and never rely on the fallback being visible.
- Don't mutate data from the portal; the seed's Calm Haven is the detail
  target and other specs depend on its state.
