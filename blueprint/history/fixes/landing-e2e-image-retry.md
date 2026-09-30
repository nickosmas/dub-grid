# Fix: Retry stalled landing image optimizer requests

**Type:** Fix

**Status:** verified

## The problem

Release PR #126 failed only Chromium Playwright shard 2. Both landing tests
timed out after a serialized `/_next/image` request waited 30 seconds. The
current test harness aborts that request and moves on, but does not retry it.
The earlier retry behavior existed specifically because a single stalled resize
can otherwise hold the image queue and fail every dependent assertion.

## The fix

Restore bounded retries for each serialized optimizer request. Keep the queue
serial, preserve the cleanup behavior, and keep an explicit overall timeout so
the test cannot wait indefinitely. The repair must continue testing the real
image optimizer rather than bypassing it.

## Build steps

- [x] Restore bounded retries to the landing image interception helper and keep
      its documented request and test-time limits internally consistent. Done when
      one stalled optimizer request does not immediately fail the landing tests or
      block every queued image request.

## Verify

- Run the affected Chromium landing tests, including their retry path.
- Run the Chromium shard 2 command used by CI where local services are
  available, or record the exact runtime limitation.
- Run `npm run type-check` and the full applicable test command before the
  repair is committed or pushed.
