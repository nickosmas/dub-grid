# Auth speed pass: integration follow-ups

**Type:** Fix
**Status:** verified

## The problem

Combining the seven groups of the 2026-10-18 auth speed pass surfaced three
changes that needed adjusting before they could ship.

1. **Feature flags reached signed-out visitors.** The app shell group seeded
   the five client feature flags from the `(app)` layout, which also renders
   `/login`. `/api/feature-flags` answers signed-in callers only, so the seed
   widened who could read them.
2. **Deferred sandbox delete raced a re-entry.** The server waits group moved
   the Test Sandbox delete on exit into `after()`. Exiting and entering again
   before the delete finished could reuse the copy that was about to go,
   failing requests until the next exit. The gain was small and internal-only.
3. **Dashboard data was primed for sign-ins that land elsewhere.** A sign-in
   sent to `/accept-terms` first still fetched up to seven dashboard queries
   that were then thrown away.

## The fix

1. The layout seeds the flags only when the request carries a session whose
   access token verifies locally (`verifyAccessToken`, the schedule page's
   pattern). `/api/feature-flags` now returns `getClientFeatureFlags()`, so
   the client-visible list lives in one place.
2. The sandbox exit deletes before it answers again (the route and its test
   are back to their previous behavior).
3. `primeSignInQueries` takes `{ dashboard }`. The password sign-in passes
   whether its destination is the dashboard, and the handoff holder passes
   whether the current path is the dashboard.

## Build steps

- [x] **1. Flags only for a verified session.**
- [x] **2. Synchronous sandbox delete on exit.**
- [x] **3. Dashboard priming follows the destination.** A new test fails
      without the gate and passes with it.

## Evidence

- `npx vitest run src/components/SignInPrefetch.test.tsx`: 9 passed; with the
  gate forced on, the new test fails.
- Type-check, lint and the full suite ran on the combined branch (see the
  completion notes).
- Not verified in a browser.
