# Fix the 3 failing CI checks on the dev→main release PR

**Type:** Fix
**Status:** verified

## The problem

PR #90 (dev → main) had three failing GitHub checks:

1. **npm audit** — 4 unreviewed high/critical CVEs: `next` and `@react-email/ui`
   (both critical, via a next RCE), `sharp` (high), `js-yaml` (high).
2. **Integration Tests (live DB)** — `mfa-assurance.integration.test.ts` failed
   with `Failed to resolve entry for package "@dubgrid/authz"`. The CI job runs
   `npx vitest run` directly in `apps/web` instead of through turbo, so nothing
   builds `@dubgrid/authz`'s `dist/` output (which its `package.json`
   `main`/`exports` point at) before the test imports it.
3. **Playwright** — 8 failed, 2 flaky, 12 passed. Root-caused to three separate
   issues once reproduced locally: (a) `@vercel/analytics`'s inline bootstrap
   script is blocked by CSP on every authenticated page load (a real bug, not
   test noise — it never picked up the per-request nonce and never gets
   trusted via `strict-dynamic`); (b) the E2E suite logs in as a handful of
   shared seeded QA accounts from 10+ spec files against a real Upstash
   instance, comfortably exceeding the account-level login rate limiter's
   hardcoded 15-per-15-minutes budget across a full run; (c) two spec files
   independently, and incompletely, tried to filter known-benign console/
   network noise (Vercel Speed Insights failing outside Vercel's own infra),
   and had drifted from each other.

## The fix

- `npm run build:packages` added as a step in the `integration-test` CI job,
  before the integration tests run.
- `next` bumped to 16.3.5 (fixes the RCE; `@react-email/ui`'s reported CVE was
  entirely attributed to next's), `sharp` override bumped to `^0.35.4`. `js-yaml`
  reached everywhere the root `overrides` block can reach (`^4.3.2`), with the
  two remaining copies nested inside `apps/mobile`'s own dependency tree
  documented in the audit allowlist (same known `install-strategy=nested`
  limitation already documented there for `fast-uri`), both dev-only tooling
  that never parses untrusted input.
- `@vercel/analytics`'s inline script's content hash added to the CSP's
  `script-src` for the authenticated app, alongside the existing nonce +
  `strict-dynamic` — CSP's own suggested remedy for a script whose trust can't
  otherwise be chained.
- `loginLimiter`'s per-account budget made env-tunable
  (`LOGIN_EMAIL_LIMIT_PER_15_MIN`), matching the pattern already used by the
  IP and global login limiters, and raised for the E2E workflow only.
- Extracted `e2e/helpers/runtime-noise.ts` as the one shared list of known-
  benign console/response noise (Speed Insights, and Next's own RSC-prefetch-
  falls-back-to-navigation message), used by both spec files instead of two
  drifting copies.

## Build steps

- [x] **Step 1 - Fix `npm audit`.** Bumped `next`/`sharp`/`js-yaml`, documented
      the two remaining `js-yaml` copies npm's overrides can't reach. Done when
      `npm run deps:audit` reports no unreviewed vulnerabilities at high or above.
- [x] **Step 2 - Fix the Integration Tests package-resolution failure.** Added
      `npm run build:packages` to the CI job. Done when
      `mfa-assurance.integration.test.ts` resolves `@dubgrid/authz` and passes.
- [x] **Step 3 - Fix the Playwright failures.** Root-caused and fixed the CSP
      block on Vercel Analytics, made the login rate limiter's per-account budget
      env-tunable and raised it for E2E, and unified the two spec files' noise
      filtering into one shared helper. Done when the full chromium Playwright
      suite passes locally.

## Verification

- `npm run deps:audit` — no unreviewed vulnerabilities at high or above.
- `npm run build:packages` then `apps/web`'s integration test file resolving
  `@dubgrid/authz` cleanly (confirmed against local Supabase).
- Full chromium Playwright suite (`npx playwright test --project=chromium`)
  against a local production build (`next build` + `next start`), including
  retries — 28/28 pass.
- `npm run type-check`, `npx turbo run lint`, `npx prettier --check .`, and
  `npm run test` (433 files / 3699 tests) all pass on top of the dependency
  bumps and code changes.
