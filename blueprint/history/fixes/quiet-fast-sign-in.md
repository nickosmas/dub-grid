# Current Feature

## A fast sign-in shows no loading screen

**Type:** Fix
**Status:** complete
**Branch:** `fix/quiet-fast-sign-in`

## The problem

After the login-speed fix (#221), signing in takes well under two seconds, yet
"Signing you in" and "Opening your organization" still flash on the way to the
dashboard. `AuthTransitionScreen` showed its title and logo the moment it
mounted, and each phase of the handoff (the login page, the route guard, the
onboarding gate) mounts its own, so even a sub-second handoff shows one or two.

## The fix

Owner (2026-10-30): the loading views after signing in should come much later,
so a normal fast sign-in never shows them.

- `AuthTransitionScreen` shows only the page background until the handoff has
  lasted `AUTH_TRANSITION_REVEAL_AFTER_MS` (2 seconds), then fades its content
  in. The delay counts from the handoff's start (`getAuthTransitionStartedAt`),
  so a screen mounted by a later phase waits only for what is left.
- The content stays in the page while hidden, so the screen keeps its name for
  assistive technology and tests.
- A failure screen (`showActionsImmediately`, the bootstrap recovery) shows at
  once.
- `SetupGuard` drops its own 400ms delay and uses the same rule.

## Build steps

- [x] **1. Delay the screen from the handoff's start.**
      `AuthTransitionScreen.tsx`, `SetupGuard.tsx`, tests in
      `AuthTransitionScreen.test.tsx`.
      **Done when:** the tests pass and a local sign-in in a production build goes
      from the form to the dashboard without the screen's title or logo.

## Verify

- `npm run type-check`, lint, the transition, login, accept-terms, setup and
  bootstrap-recovery suites.
- Browser: sign in as `qa-super-admin@dubgrid.test` on a production build and
  record whether the title or logo ever renders visibly.

## Evidence

- Type-check and lint clean; the transition, login, accept-terms, setup, setup
  lock and bootstrap-recovery suites pass (77 tests).
- A local production build, signing in as `qa-super-admin@dubgrid.test` on the
  same organization, sampled every 10ms: the form left `/login` at 356ms, the
  "Opening your organization" screen was in the page from 61ms to 668ms after
  submit at opacity 0 throughout, and the dashboard followed. The org-switch
  path (a full reload) uses the same handoff start from session storage and is
  covered by the unit test.
