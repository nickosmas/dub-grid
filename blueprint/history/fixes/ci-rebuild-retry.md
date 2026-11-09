# Fix: CI retries the dependency rebuild

**Status:** complete

## Problem

A Playwright shard on release #441 failed before any test ran: the
`deps:rebuild` step's postinstall download (Prisma engines or the Sentry CLI)
dropped with `Error: aborted`, and the step had no retry, so one dropped
connection failed the whole job.

## Fix

- The rebuild step in `e2e.yml` and both in `ci.yml` try up to three times,
  waiting 10 and then 20 seconds between attempts, and fail only if all three
  do.

## Evidence

- Both workflows parse as YAML. The failed job on #441 was rerun by hand; with
  this, the next dropped download retries on its own.
