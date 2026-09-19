# Feature: Profile and Alerts state coverage

**From build-plan:** feature 25d1c1
**Status:** verified

## Goal

`/profile`'s manifest entry lists `lazy panels`, `loading`, and `error`, and
`/alerts` lists `loading`, `error`, and `empty`, all as
`sourceReviewedStates`. Tracing the actual components, every one of the six
is real and has a deterministic trigger:

- **`/profile` loading** - `ProfilePage.tsx:88-90` renders
  `<ProgressBar loading />` while permissions or `useSelfProfileData()` load;
  the latter is one request, `GET /api/account/self` (with an `orgId`
  query, `features/account/client/api.ts:191-197`). Delaying that request
  holds the progress bar on screen.
- **`/profile` error** - `ProfilePage.tsx:92-101`: when the self-profile
  query fails, the page renders the error message and a "Try again" button
  that calls `refetchProfile()`. A failed `/api/account/self` reaches it, and
  lifting the failure then clicking the button proves the recovery path.
- **`/profile` lazy panels** - not `next/dynamic` (nothing in
  `components/account` or `components/profile` code-splits); the manifest's
  claim means the section panels mount only while active.
  `ProfilePage.tsx:112-168` renders exactly one of `ProfilePanel`,
  `SecurityPanel`, `NotificationsPanel`, `AppearancePanel`,
  `DataPrivacyPanel`, or `SelfWorkOverview`, chosen from `?section=`
  (`profile-nav-config.tsx`: `profile`, `security`, `notifications`,
  `appearance`, `data-privacy`, and `overview` only when the viewer is on
  the schedule).
- **`/alerts` loading** - `AlertsInboxPage.tsx:588-589`: while
  `loadingPage` is true the list area renders `ListPlaceholder`
  (`:1435-1447`, `aria-busy="true"`). The page loads its list through
  `searchNotifications()` = `POST /api/notifications/search`
  (`features/notifications/client/api.ts:98-106`). The header bell uses a
  different path (`GET /api/notifications`), so a route mock on
  `/api/notifications/search` leaves the bell untouched.
- **`/alerts` error** - `:319-354`: the search promise's `.catch` sets
  `error`, and `:590-595` renders `EmptyState` with heading "Couldn't load
  alerts". A 500 on the search POST reaches it.
- **`/alerts` empty** - `:596-601`: `notifications.length === 0` renders
  `EmptyState` "No alerts". Fulfilling the search POST with an empty result
  reaches it without touching seeded data.

Both routes also have a route-level `loading.tsx` and `error.tsx`. The
manifest's `loading` claim for each is satisfied by the in-page state above,
which is deterministic and specific to the route; the route-level Suspense
fallback technique was already proven once for the epic in 25d1b1 and is
not re-proven here. Neither route's `error.tsx` boundary is a separate
manifest claim (same reading as 25d1b1).

## In scope

- Playwright coverage for all six states, in two new files:
  `e2e/alerts-states.spec.ts` and `e2e/profile-states.spec.ts` (mirroring
  `dashboard-states.spec.ts`, `schedule-states.spec.ts`,
  `people-states.spec.ts`).
- Update `e2e/typography-route-manifest.ts` as each state gets real
  coverage, ending with `sourceReviewedStates: []` for both routes.

## Out of scope

- `/reports` and `/settings` - 25d1c2.
- Route-level `loading.tsx` fallbacks and `error.tsx` boundaries for these
  two routes (see Goal).
- Interactions inside each profile panel (MFA enrollment, session revoke,
  calendar subscription) - 19b/19d qualified the security flows; this
  feature proves the panels mount, not their internals.
- Role variance in which profile sections appear (`overview` is
  schedule-gated) - 25d2's job; the test handles the qa-super-admin case
  either way.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Cover `/alerts`'s loading state.** In a new
      `e2e/alerts-states.spec.ts`, `page.route` only
      `**/api/notifications/search` with a delay (the same delay technique as
      25d1a's bootstrap test), navigate to `/alerts`, and assert the list
      placeholder (`[aria-busy="true"]` inside the inbox) is visible and then
      gone once the response lands. Assert the header bell still rendered
      (its `GET /api/notifications` must pass through untouched). _Done when_
      the test passes 3 runs in a row and the manifest moves `"loading"` to
      `browserStates` for `/alerts`.
- [x] **Step 2 - Cover `/alerts`'s error state.** Fulfill the search POST
      with a 500 and assert the `EmptyState` heading "Couldn't load alerts".
      _Done when_ the test passes and the manifest moves `"error"` to
      `browserStates` for `/alerts`.
- [x] **Step 3 - Cover `/alerts`'s empty state.** Read `SearchResponse` in
      `features/notifications/client/api.ts` for the exact shape, fulfill the
      search POST with a valid empty result, and assert the "No alerts"
      `EmptyState`. _Done when_ the test passes and `/alerts`'s
      `sourceReviewedStates` is empty.
- [x] **Step 4 - Cover `/profile`'s loading state.** In a new
      `e2e/profile-states.spec.ts`, first grep for every caller of
      `/api/account/self` (the app shell or account menu may also call it);
      if another caller exists, match the mock on the query string
      `ProfilePage`'s request carries (`orgId=`) so only that request is
      delayed. Navigate to `/profile` and assert `[data-progress-bar]` is
      visible, then gone. _Done when_ the test passes 3 runs in a row and the
      manifest moves `"loading"` to `browserStates` for `/profile`.
- [x] **Step 5 - Cover `/profile`'s error state, including recovery.** Fail
      the same request with a 500, assert the "Try again" button and message
      render, then unroute the mock, click "Try again", and assert the
      profile panel renders. _Done when_ the test passes and the manifest
      moves `"error"` to `browserStates` for `/profile`.
- [x] **Step 6 - Cover `/profile`'s section panels.** For each of
      `?section=profile|security|notifications|appearance|data-privacy`,
      navigate and assert one distinctive heading or control from that panel
      (read each panel component for the exact text while writing the test);
      assert the other panels' distinctive text is absent, which is what
      "lazy" means here. Handle `overview` conditionally: only assert it when
      the nav shows an "Overview" item. _Done when_ the test passes and
      `/profile`'s `sourceReviewedStates` is empty.

## Files / areas

- New: `e2e/alerts-states.spec.ts`, `e2e/profile-states.spec.ts`
- `e2e/typography-route-manifest.ts`
- Read-only: `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`,
  `apps/web/src/components/profile/ProfilePage.tsx`,
  `apps/web/src/components/account/*Panel.tsx`,
  `apps/web/src/features/notifications/client/api.ts`,
  `apps/web/src/features/account/client/api.ts`

## Data / contracts

None - test coverage and manifest bookkeeping only. No product code, type,
or stored shape changes are expected. If a step finds a real defect (a state
that renders wrong, or a mock that breaks an unrelated part of the page),
flag it for a decision rather than patching product code inside this
feature.

## Testing

- This feature's product _is_ test coverage, same as 25d1a-25d1b2. Each
  step's "done when" is a passing Playwright test.
- Run each new test 3 times consecutively before calling a step done (the
  epic's standing rule since 25d1b1's flakiness find).
- Run the manifest's coverage-shape test after each manifest edit.
- Run with the project's real command: `npm run test:e2e -- <file>`.

## Notes for the AI

- Reuse the epic's established patterns: `loginAsQaSuperAdmin` and
  `clearBlockingOverlays` from `e2e/helpers/auth.ts`, the
  `[data-progress-bar]` marker, and the delay/fail/fulfill `page.route`
  techniques from `dashboard-states.spec.ts` and `people-states.spec.ts`.
- Scope every mock as narrowly as the endpoint allows. `/alerts` is easy
  (the list and the bell use different paths); `/profile`'s Step 4 grep
  decides whether `/api/account/self` needs query-string matching. A mock
  that also breaks the app shell would produce a false negative or a
  confusing failure, not evidence.
- Assert on rendered text and ARIA, not implementation details: the
  `EmptyState` headings, the "Try again" button, `aria-busy`, and each
  panel's own heading.
- Don't touch seeded data to reach the empty inbox; the fulfilled empty
  response is the trigger.
