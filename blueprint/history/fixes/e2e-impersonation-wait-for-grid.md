# Fix: The impersonation E2E tests wait for the schedule grid before leaving it

**Type:** Fix
**Status:** verified
**Branch:** fix/e2e-impersonation-escape-wait

## Problem

On release PR #173, "navigating to /gridmaster while impersonating is the safety escape" failed in WebKit on all three attempts with `console:TypeError: Load failed`. Its trace shows `/api/organization/bootstrap` and `/api/employees/manage` still in flight when the test navigated to `/gridmaster`, so the navigation cancelled them and WebKit logged the cancellation. `startImpersonation` waited for `[data-schedule-loading]` to be gone, but that loading screen is also absent before the schedule starts loading, so the wait passed at once. The End Session test hit the same error once.

## Change

`startImpersonation` (e2e/role-variance-impersonation.spec.ts) waits for the schedule grid to be visible, then for the loading screen to be gone, before any test leaves the landing page. No app code changes.

## Checks

- The CI trace (run 40024177670, WebKit shard 3) names the cancelled requests.
- Local WebKit runs against a webpack dev server are not representative: compiling on first visit interrupts the warm-up navigations. The safety-escape test passed there once it got past warm-up. Proof is the release PR's CI on the production build.
