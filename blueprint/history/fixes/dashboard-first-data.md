# Dashboard first data starts at sign-in and is cached

**Type:** Fix
**Status:** verified (tests and type-check; not in a browser)

## The problem

A speed audit (2026-10-18) of the first screen after sign-in found the
dashboard's own data waited a wave longer than it had to, and was never cached.

1. **The dashboard's data loaded in a third wave, uncached.** `DashboardView`
   asked for the window's shifts, published ranges and publish history in one
   `useEffect`, and the recent published changes in another. The view mounts
   only once the organization, permissions and employees have answered, so
   these started after all three, and nothing kept them: every visit asked
   again. Schedule notes, invitations and requests were already queries.
2. **The dashboard's code downloaded after the route's payload.**
   `DashboardPageContent` imported `DashboardView` statically, so its chunk
   came with the route rather than while the sign-in request ran.
3. **The schedule's first paint waited on the change chips** and **an editor's
   hard load fetched the window twice**: both claims were checked against `dev`
   and are already fixed. The initial load commits shifts, notes and ranges
   straight after its `Promise.all` and applies the recent-publish chips from a
   promise that runs beside it, and it waits for permissions (up to
   `PERMISSIONS_WAIT_MS`) before fetching, never refetching for drafts. No
   change made.

## The fix

1. `components/dashboard/dashboardQueries.ts` holds the dashboard's query
   options and windows. Shifts, published ranges, publish history and recent
   changes are `useQuery`s under the organization's keys, with the date window,
   the scheduler flag (editor or viewer, since the schedule API withholds drafts
   from viewers) and the grid labels the API renders with in the key. Shifts,
   ranges and recent changes sit under `shifts.all(orgId)` and publish history
   under `org.publishHistory(orgId)`, so the existing realtime invalidation now
   refreshes them, which the old effects never did. The loading screen still
   shows until shifts, ranges and (for admins) history answer; a period seen in
   the last five minutes now opens at once.
2. `primeSignInQueries` waits for the bootstrap and permissions it already
   started, then `primeDashboardQueries` asks for the default week's shifts,
   ranges, notes, recent changes and requests, and for an admin the publish
   history and invitations, under the exact keys the view computes. It uses the
   bootstrap's organization id (sandbox-aware), and does nothing for an
   organization still onboarding or locked, a management-only account, or an
   admin previewing as a user. The absence-label map moved to an exported
   `buildAbsenceTypeLabelMap` and the request key to `shiftRequestsQueryKey`
   so both sides build the same keys.
3. `DashboardView` is a `next/dynamic` import whose loading state is the same
   top progress bar the page shows before it, and `preloadDashboardView()`
   (its own small module, so the sign-in form does not bundle the page) starts
   the same `import()`. `OrgLogin` calls it as the password submit starts.

Must not break: drafts reaching a viewer's cache (keys carry the scheduler
flag; the server decides drafts from the session either way), the org boundary
(every key carries the org id), and realtime refresh of notes and requests.

## Build steps

- [x] **1. Dashboard data as cached queries.** Done when the four raw fetches
      are `useQuery`s keyed by org, window, scheduler flag and labels.
- [x] **2. Prime the default week at sign-in.** Done when a member's sign-in
      asks for the dashboard's cells under the key the view reads, and the
      gates prime nothing.
- [x] **3. Dynamic dashboard with a preload.** Done when the view loads through
      `next/dynamic` with the progress bar as fallback and the sign-in submit
      starts its download.
- [x] **4. Schedule first paint and double fetch.** Verified already fixed on
      `dev`; skipped.

## Verify

- `npx tsc --noEmit -p apps/web/tsconfig.json`, ESLint and Prettier on the
  changed files, and the focused web suites below.

## Evidence

- Web type-check: clean. ESLint and `prettier --check` on every changed file:
  clean.
- Focused suites, 21 files and 213 tests passing: the new
  `dashboardQueries.test.ts` (windows, admin and staff keys, every gate),
  `SignInPrefetch.test.tsx` (a new case proves a sign-in reaches the
  dashboard's cells key), `DashboardPageContent.test.tsx` (now awaits the
  dynamic view), the dashboard component and hook tests, login tests,
  `useShiftRequests`, `useOrganizationData.enabled`, hero metrics and the
  typography contract.
- Not verified in a browser: the sign-in waterfall, the chunk overlap, and the
  realtime refresh of the dashboard were not exercised against a running app.
