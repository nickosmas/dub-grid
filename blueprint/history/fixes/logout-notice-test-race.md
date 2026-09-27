# Fix: The password sign-out notice test races the sign-out

**Type:** Fix
**Status:** verified

## The problem

`RunLogoutTeardown.test.tsx` > "labels a password change's global sign-out for
the audit trail" failed in CI on `dev` (run 36312088532, commit `55d1a103`,
2026-09-27) and passed on the next run, whose only change was a spec file.

The test waits until `signOutFromBrowser` has been called, then asserts the
password notice at once. The component shows that notice only after the
sign-out resolves, a state update re-renders and an effect runs, so under CI
load the assertion can land first. Reproduced locally by making the sign-out
resolve after 200 ms: the same `AssertionError` on the same line. The
component is correct; the test asserts one step early.

"Shows no password notice for a local sign-out" has the same shape in the
negative: it asserts no notice right after the call, before the teardown has
finished, so it would pass even if a notice arrived later.

## The fix

Test-only. The password test resolves the sign-out itself: it asserts that no
notice has shown while the sign-out is pending, releases it, then waits for the
notice. The local test waits for the teardown to finish (the "Sign back in"
link) before asserting that no notice showed. No product code changes.

## Build steps

- [x] **Step 1 - deterministic notice tests** - _Done when:_ both tests pass,
      the password test fails if the component shows the notice before the
      sign-out resolves, and the file passes repeated runs. _Done 2026-09-27:_
      15/15 pass; 30 consecutive runs of the file pass; the test fails when the
      component is changed to show the notice before the sign-out resolves;
      type-check, lint and `test:web` (5117 tests) pass.

## Verify

- From `apps/web`, run
  `npx vitest run "src/app/(app)/goodbye/__tests__/RunLogoutTeardown.test.tsx"`
  repeatedly; every run passes.
