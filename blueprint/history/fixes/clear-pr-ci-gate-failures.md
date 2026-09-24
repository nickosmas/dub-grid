# Clear PR CI gate failures

**Type:** Fix  
**Status:** verified

## The problem

PR #103 initially could not merge because its dependency-audit job reported ten
unreviewed high-severity transitive packages introduced by the newly pinned
Mintlify toolchain. That repair is complete. The replacement Playwright run
showed that its isolated shards still share the dedicated E2E Redis counters:
local app servers send no forwarded IP, so every shard uses the same
`unknown` login-IP key and can throttle another shard. Its artifact names also
contained `/`, which GitHub Actions rejects. Once those were repaired, the
full-browser run failed in WebKit: the production-mode CSP upgraded each local
HTTP CSS and JavaScript request to HTTPS, although `next start` served only
HTTP. The resulting TLS failures prevented every affected page from hydrating.

## The fix

Remove the prematurely bundled Mintlify toolchain from this PR without
silently allowlisting new high-severity advisories. The package scripts refer
to documentation source that remains untracked in the shared checkout, so
this restores a coherent release candidate while preserving that unrelated
work locally. Make concurrent E2E shards safe by giving the dedicated test
Redis database appropriate E2E-only login headroom, use valid artifact names,
and require the full Chromium, Firefox, and WebKit suite on every PR. Exempt
loopback hosts only from CSP's `upgrade-insecure-requests`, keep the directive
for deployments, and scope login helpers to their hydrated forms after the
browser can load the client bundle. Preserve the dedicated E2E Upstash boundary
and prove the workflow completes.

## Build steps

- [x] Remove the Mintlify dependency tree and its premature documentation scripts
      from this PR, update its lockfile, and leave the uncommitted documentation
      source untouched.
  - Done when `npm run deps:audit` passes without a new high-severity
    allowlist entry.
- [x] Repair the sharded Playwright workflow's confirmed cross-job login-rate
      limiting and invalid artifact names, without changing production limits.
  - Done when every shard has its own valid artifact names and E2E-only Redis
    headroom prevents one local server's `unknown` IP key from throttling
    another.
- [x] Fix WebKit's local production-mode asset transport and retain a safe
      hydrated-form selection for login helpers.
  - Done when loopback responses do not upgrade HTTP assets, deployed-host
    responses still enforce HTTPS upgrades, and the form helper never targets
    an unhydrated login root.
- [x] Repair the rerun's localhost apex redirect loop and ambiguous Gridmaster
      sidebar selection, then investigate remaining browser-specific failures.
  - Done when real HTTP redirects reach the apex without looping, the Alerts
    test clicks the sidebar item, and remaining failures have verified repairs.
- [x] Remove the failing build-time Google-font loader by vendoring the exact
      existing WOFF2 assets and preserving font families, subsets, weights,
      fallback metrics, and Latin preloads.
  - Done when fonts compile without Google fetches, font contracts pass, and
    production browser qualification verifies typography and navigation.
- [x] Bound sign-out cookie cleanup to valid application domains and use
      host-only cleanup on localhost and IP hosts.
  - Done when Firefox sign-out has no invalid-domain cookie errors and
    deployment-domain cleanup remains covered by regression tests.
- [x] Require the complete Chromium, Firefox, and WebKit suite on every PR,
      split into four serial-worker shards per browser.
  - Done when the E2E workflow completes successfully with no cancelled or
    failed Playwright job, and every PR carries the full browser matrix.

## Verify

- `npm run deps:audit`
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run build`
- `npm run test:e2e` or the equivalent CI-qualified Playwright command
- Observe every PR #103 GitHub check passing before merge.

## Verification evidence — 2026-09-24

- Pushed candidate: `e4334de7bac407df8e784a8bc10390f2c5eec0d5` on `dev`, PR #103.
- Local full verification passed: dependency audit (existing 13 allowlisted
  advisories), lint (three pre-existing warnings), all-workspace type-check,
  all-workspace tests (web: 501 files / 4,267 tests), and production build.
- Production preflight and font checks: 9 passed across Chromium, Firefox,
  and WebKit. Public landing/typography matrix: 12 passed. Isolated-dev
  sign-out/not-found navigation regression checks: 6 passed across all engines.
- CI E2E run `35984093752`: all 12 browser/shard jobs passed. CI run
  `35984093803` and dependency audit run `35984093863` passed on this candidate.
  PR check watcher exited successfully; PR remains open and unmerged.
- Main dev server restarted on localhost:3000 and verified to emit absolute
  apex redirects. Temporary verification servers/tabs were stopped/closed.
- Regular audit/check/try gates remain manual. Separate open P0/P1 findings
  F-08 through F-21 in the shared findings ledger are not waived or repaired
  by this CI fix; they still block broader completion/release clearance.

Archived 2026-09-24: PR #103 merged to `main` on 2026-09-24 as merge commit
`5b6c1492`, with 24 checks passing and the external Mintlify deployment
check skipped. This record was left in the working tree unlogged and is
archived here without changes to its evidence above.
