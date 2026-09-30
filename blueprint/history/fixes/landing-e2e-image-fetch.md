# Fix Landing E2E Image Fetches

**Type:** Fix

**Status:** verified

## The problem

The release pull request's Chromium and Firefox shard 2 jobs both fail the
landing-page rendering and dark-mode checks. Their common failure is a
30-second timeout while the Playwright route handler fetches the optimized
`mobile-home.png` response. Retrying that same intercepted fetch still leaves
the real page request stalled.

## The fix

Change the landing tests' image-loading strategy so page navigation cannot
deadlock on an intercepted optimizer request. Keep the visual assertions and
add a bounded, sequential assertion against the real image optimizer response
so the test continues to cover the production image path.

## Build steps

- [x] **Make landing image checks deterministic**
  - Replaced the route-fetch retry path with a test-side request strategy that
    lets landing-page navigation complete while checking optimized image
    responses sequentially.
  - Preserved the existing rendered-image assertions and both color-scheme
    scenarios.
  - Done when the focused landing Playwright test passes in Chromium without
    an `/_next/image` route-fetch timeout.

## Verify

- `npx playwright test e2e/landing.spec.ts --project=chromium --reporter=line`
  passed with 3 tests.
- `npx playwright test e2e/landing.spec.ts --project=firefox --reporter=line`
  passed with 3 tests.
- `npm run type-check` passed.
- `npm run test` passed: 23 tasks, including 614 web test files and 5,367
  tests.
- `next build . --webpack` passed from `apps/web`. Webpack was necessary in
  the disposable worktree because Turbopack rejects external dependency
  symlinks.
