# Stabilize full web test suite

**Type:** Fix

**Status:** not started

## Problem

The full web Vitest suite times out resource-heavy tests even though they pass in
isolation, blocking the pre-push hook.

## Fix

Run the web suite with a bounded worker count so local Supabase integration tests
and property-based UI tests do not contend with the rest of the suite.

## Build steps

1. [ ] Configure the web Vitest runner for reliable worker scheduling and verify the
       full suite passes.

   Done when: `npm --prefix apps/web test` completes with no test failures.

## Verify

- Run `npm --prefix apps/web test`.
