# Feature: Web browser role and state qualification

**From build-plan:** feature 40e3 (parent 40e, Cross-platform runtime qualification)
**Status:** complete
**Branch:** `feature/40e3-web-qualification` (cut from `dev` at f85236b3)

## Goal

Run the documented web matrix (`runtimeProfiles.web` in
`internal/documentation/accuracy-manifest.json`: Chromium, Firefox and
WebKit; desktop and narrow; signed-out, user, management-only user, limited
admin, admin and super admin) against a dedicated local E2E environment, and
keep the result as dated evidence the documentation checks can read. Nothing
in the product changes; this adds tests, a runner and evidence.

## Decisions (made for the owner, 2026-10-22)

- **The dedicated local environment** is a seeded throwaway Supabase stack
  (`npm run db:migrations:rehearse -- --from 087 --seeded`, on 55321/55322),
  a local Upstash-compatible store (Redis plus `hiett/serverless-redis-http`
  in Docker) standing in for CI's dedicated E2E Redis, and the production
  build started by `scripts/run-production-e2e.mjs` on port 3002, the same
  shape as CI. The shared local stack and real credentials are never used,
  and email sending is off (`RESEND_API_KEY` empty).
- **Evidence** is a dated record under
  `internal/operations/runtime-qualification/` (like 40e2's rehearsal
  records) plus a `runtimeEvidence` list in the manifest that the docs
  check validates. The check gains `--require-runtime-evidence`, which 40e
  completion runs; the everyday gates only check the shape, so nothing else
  is blocked while 40e4 is open.
- **Limited admin** is `qa-admin` with only schedule viewing and request
  approval, set for the spec and restored after it; the matrix's other five
  roles already have specs.
- **Narrow** is a 390 by 844 viewport, run as extra Playwright projects for
  the specs tagged `@narrow`.

## Build steps

- [x] **Step 1 - Evidence contract** - `runtimeEvidence` entries (`{ id,
platform: "web" | "ios" | "android", target, viewport, roles, states,
recordedAt, commit, environment, result: { passed, failed, skipped },
record }`) are validated by `scripts/documentation/contract.ts`: targets,
      viewports and roles come from `runtimeProfiles`, the record file exists,
      and a passing entry has no failures. `--require-runtime-evidence` fails
      unless every web browser and viewport and each mobile platform has a
      passing entry.
      _Done when:_ contract tests cover a valid entry, an unknown browser or
      role, a missing record, a failing entry, and the requirement flag with
      and without full coverage; `npm run docs:check` passes.
- [x] **Step 2 - Limited admin** - `e2e/role-variance-limited-admin.spec.ts`
      narrows `qa-admin` for the run and checks its route entry contract:
      Schedule read-only, People and Requests as allowed, Settings and
      Reports falling back.
      _Done when:_ the spec passes in Chromium against the environment.
- [x] **Step 3 - Narrow** - Playwright projects `chromium-narrow`,
      `firefox-narrow` and `webkit-narrow` (390 by 844) run the `@narrow`
      tests: a new `e2e/narrow-viewport.spec.ts` signs in as each role and
      checks its landing surface fits the width (no horizontal scroll, the
      navigation reachable).
      _Done when:_ the narrow projects pass in Chromium.
- [x] **Step 4 - The run** - `scripts/e2e/qualify-web-local.mjs` checks the
      environment is the throwaway one, runs the suite through the
      production runner with a JSON reporter, and writes the dated record
      (per project: passed, failed, skipped, and every failure's title) and
      its `runtimeEvidence` entries. Failures are triaged: a product defect
      becomes a finding; a test that cannot pass outside CI is recorded with
      the reason.
      _Done when:_ every desktop and narrow project in all three browsers has
      run, the record and entries exist, and `npm run docs:check` passes.

## Out of scope

- iOS and Android (40e4), CI changes, and any product change.

## Notes for the AI

- Never reseed or reset the shared local stack; other sessions use it.
- Stop the throwaway stack and the Redis containers afterwards.

## Result

- Evidence: `internal/operations/runtime-qualification/2026-10-22-web.md`
  and six `runtimeEvidence` entries in the accuracy manifest, one per
  browser and viewport, every one passing. Desktop projects prove all six
  roles; narrow projects prove all but limited admin.
- `docs:check --require-runtime-evidence` now reports only the missing iOS
  and Android evidence (40e4).
- Triage: Firefox and WebKit failed the sign-out propagation test in the
  first run because its socket-noise filter pinned CI's stack port; the
  filter now accepts any loopback port and both browsers were re-run in
  full. Two different WebKit tests each passed only on a retry, once each,
  and are recorded as flakes rather than findings.
- Gates: type-check, lint, `test:mobile`, `test:web`, `docs:check`, the
  runner's `node --test` file, and the production build inside the E2E
  runner.
