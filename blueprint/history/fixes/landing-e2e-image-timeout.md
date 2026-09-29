# Fix: Bound landing-image optimizer requests in Chromium E2E

**Type:** Fix  
**Status:** verified

## The problem

PR #125's Chromium shard 2 timed out while its landing-page interceptor retried
cold `/_next/image` requests three times at ten seconds each.

## The fix

Use one bounded 30-second request to the real optimizer rather than aborting
and queuing retries behind the same serialized interceptor.

## Verification

`npx playwright test e2e/landing.spec.ts --project=chromium --reporter=line`
passed all three focused landing tests locally.
