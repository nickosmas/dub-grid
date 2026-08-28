# Stabilize local Playwright e2e execution

**Type:** Fix

**Status:** verified

## Problem

`npm run test:e2e` fails locally for two unrelated environment and runner
reliability reasons. Firefox and WebKit executables have not been installed, and
the local suite starts unbounded parallel workers against the Next development
server. The latter causes Chromium navigation timeouts even though the same
eight tests pass with one worker.

## Fix

Make the repository's e2e command use a safe local worker limit while retaining
the configured browser matrix. Document the required Playwright browser
installation in the test command guidance so a fresh checkout has a direct
recovery path. Do not change application behavior or reduce browser coverage.

## Build steps

1. [x] Bound local Playwright worker concurrency in the shared configuration and
       document the browser-install prerequisite for `test:e2e`.

   Done when: `npm run test:e2e` uses the full Chromium, Firefox, and WebKit
   projects with a local worker limit that avoids development-server contention,
   and the setup instruction identifies the exact browser-install command.

2. [x] Wait for the login form to hydrate in every configured browser and keep
       the People smoke test synchronized with the route transition.

   Done when: WebKit submits the client login request after the login page is
   interactive, and the People smoke test still proves that activating the
   People navigation reaches `/people` without relying on a fixed delay.

3. [x] Make the default local load suites use an organization-login test account
       and a bounded local full-stack latency budget.

   Done when: both local k6 smoke suites reject failed requests while allowing
   local machine and local Supabase overhead, and non-local targets retain the
   stricter deployed-service thresholds.

4. [x] Repair F-06 - revoke all sessions when an organization membership is archived.

   Done when: removing a user invalidates their active sessions before the
   endpoint returns, and focused coverage proves the revocation hook runs for
   the archived membership.

## Verify

- Install the configured Playwright browsers.
- Run `npm run test:e2e` and confirm all browser projects complete without
  navigation timeouts.
- Run `npm run test:load` and `npm run test:load:auth` against the production
  server on port 3000.
- Run the focused organization-access route tests and session-revocation tests.
