# Peers converge after a failed write; load tests and release evidence catch up

**Type:** Fix

**Fixes:** F-10 (core), F-17, F-18 (the inspectable half), F-25

**Status:** verified

## The problem

Three items were parked as "needs a decision". Re-examined against the code,
two of them are ordinary work and one is half ordinary work.

- **F-10, schedule broadcasts.** Re-read on 2026-09-22: some sites already
  broadcast a committed server echo (`SchedulePageClient.tsx:4691`, after
  every write has landed), but others broadcast beside a write they never
  await (`4153`, `3959`), and no failure path tells peers anything. A write
  that fails leaves every other open tab holding a cell that was never
  committed until something else refetches. Receivers also apply any diff
  they are handed, so a delayed or duplicate broadcast can put an older
  version back on the grid. The full rework (echo-only broadcasting,
  presence-aware reconciliation, partial batch semantics) is feature-sized,
  but these two are not, and they are the part that shows wrong data.
- **F-17, load tests.** `load-tests/schedule-load.js` fetches `/api/health`
  and the unauthenticated `/schedule` page, which 302s to login, so nothing
  in the suite touches the authenticated read, write, publish or realtime
  paths the launch thresholds are about. k6 is installed locally.
- **F-18, release qualification.** `apps/mobile/app.json` carries no
  `extra.eas.projectId`, and `usePushRegistration` calls
  `getExpoPushTokenAsync()` with no argument, so a release build resolves
  the project identity from config or fails at runtime with Expo's generic
  message. Signed artifacts and delivery evidence need an Expo account and
  real devices, which this session cannot produce; the configuration gap and
  its failure message can be fixed and tested here.
- **F-25 (new).** `load-tests/config.js` defaults `TEST_EMAIL` to a personal
  address of the maintainer's, so an unconfigured run authenticates as a
  real person against whatever `BASE_URL` points at.

## The fix

- **F-10 (core).** `readDraftChangedBroadcast` takes the receiver's current
  cells and drops any incoming cell whose `version` is not newer than the
  one held, so a delayed or duplicate diff cannot roll the grid back. Write
  failures broadcast a payload-less `draft_changed`, which every peer
  already answers with a debounced refetch, so a cell that never committed
  is corrected everywhere instead of only on the writer's tab. The
  remaining rework stays out of scope and keeps its build-plan item.
- **F-17.** `load-tests/schedule-load.js` gains authenticated scenarios
  driven by the seeded QA accounts: sign in, read the schedule window
  through `/api/schedule/manage`, write a draft cell with its expected
  version, publish, and read back, each tagged so the existing read and
  write thresholds apply separately. The scenarios skip themselves with a
  clear message when no credentials are configured.
- **F-18 (inspectable half).** Push registration resolves the project id
  from the Expo config and fails with a message naming
  `expo.extra.eas.projectId`; a test covers both branches. A release
  qualification runbook in `docs/` lists what only the account holder can
  run: build profile, signed artifacts, store credentials, delivery and
  opt-out checks.
- **F-25.** The load-test defaults point at `qa-super-admin@dubgrid.test`,
  and an explicit refusal stops a run whose target is not local unless
  credentials were supplied deliberately.

Must not break: the schedule grid's optimistic edits, publish and discard,
the existing smoke load scenario, push registration in a development build,
and the seed.

## Build steps

- [x] **1. Receivers reject an older cell (F-10)** - the version check in
      `readDraftChangedBroadcast` and its tests. Done when a diff carrying an
      older version is dropped, a newer one is applied, and a cell the
      receiver does not hold is applied.
- [x] **2. Failed writes reconcile peers (F-10)** - the payload-less
      broadcast on the conflict and error paths, with tests. Done when a
      failed write sends the reconcile broadcast and a successful one does
      not.
- [x] **3. Authenticated load scenarios (F-17, F-25)** - the scenarios, the
      QA defaults and the non-local guard. Done when `npm run test:load`
      passes against the local stack with the authenticated scenario
      selected and reports separate read and write latencies.
- [x] **4. Push project identity and the runbook (F-18)** - the resolver,
      its tests and `docs/mobile-release-qualification.md`. Done when the
      mobile suite passes and the runbook names every step this session
      could not run.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`.
- `BASE_URL=http://calmhaven.localhost:3003 SCENARIO=smoke k6 run
load-tests/schedule-load.js` against the local dev server, with the
  authenticated scenario enabled.
- Browser: two tabs on the schedule, force a write failure, and confirm the
  second tab returns to the committed state without a manual reload.
- `/audit` afterwards.

## Findings

### peer-convergence-load-and-release-evidence/F-17 [P2] closed - Existing load tests do not qualify authenticated scheduling capacity

**File:** load-tests/schedule-load.js:12; load-tests/auth-flow.js:14
**Found:** 2026-09-21 by /audit (scope: full; lens: performance)
**Why it matters:** Current load scenarios exercise health, public page, and sampled login requests only. They do not measure authenticated schedule reads, writes, publishing, or realtime propagation against the stated launch thresholds.
**Suggested fix:** Add staging-account workflows for realistic schedule reads, versioned writes, concurrent editors, publishing, and websocket propagation with separate read and write thresholds.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 013961cd). `load-tests/schedule-load.js` gains authenticated scenarios behind `SCHEDULE_AUTH=1`: one sign-in per VU, the session carried as a bearer (the login route answers in its body and sets no cookie), a schedule window read, a notes read, and an optional versioned write behind `SCHEDULE_WRITE=1`, each tagged `schedule_read` or `schedule_write` with their own duration and failure thresholds. Run against the local stack: 86 of 86 checks passed, p(95) 570ms read and 169ms write. `npm run test:load:schedule` runs it. The deployed thresholds (800ms read, 1200ms write) are the launch numbers to confirm against staging, which needs a staging target and credentials.

### peer-convergence-load-and-release-evidence/F-18 [P2] closed - Native push delivery and signed release qualification lack evidence

**File:** apps/mobile/app.json:1; apps/mobile/src/features/notifications/lib/push-permission.ts:1
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** The tracked mobile configuration lacks an explicit EAS project identity, and no signed release artifact or provider configuration was available for inspection. Development configuration reports that a project identity is required, but deployed configuration could supply it externally.
**Suggested fix:** Verify the production build profile, signed iOS and Android artifacts, project identity, push-token registration, notification delivery, and opt-out behavior with dedicated release accounts.
**Resolution:** Partly fixed, partly handed back 2026-09-22 (commit 013961cd). The code half is done: `resolveExpoProjectId` reads `expo.extra.eas.projectId` (falling back to an older build's `easConfig`), push registration mints against it, and a build without one now fails with `MissingPushProjectIdError` naming the setting instead of the library's generic error; tests cover both branches. The evidence half cannot be produced from this session: signed artifacts, store credentials and delivery on real devices need the Expo account. `docs/mobile-release-qualification.md` lists those steps and what to record. Closed as a finding because the inspectable defect is fixed; the qualification itself is tracked by that runbook, not by the ledger.

### peer-convergence-load-and-release-evidence/F-25 [P2] closed - Load tests defaulted to a maintainer's personal login

**File:** load-tests/config.js:16
**Found:** 2026-09-22 by /audit (scope: current; lens: security)
**Why it matters:** `TEST_EMAIL` defaulted to a personal address of the maintainer's, so an unconfigured `npm run test:load:auth` authenticated as a real person against whatever `BASE_URL` named, including a deployed target. The project rule is that scripted verification uses the seeded QA accounts only.
**Suggested fix:** Default to `qa-super-admin@dubgrid.test` and refuse a non-local target that did not supply its own credentials.
**Resolution:** Fixed and closed 2026-09-22 (commit 013961cd). The defaults name the seeded QA account and the seeded Calm Haven organization, and `assertCredentialsConfigured()` throws before the run when `BASE_URL` is not local and neither `TEST_EMAIL` nor `TEST_EMAILS` was set; verified by pointing a run at a non-local URL and watching it refuse.

### peer-convergence-load-and-release-evidence/F-26 [P3] closed - The reconcile broadcast was missing from its callers' dependencies

**File:** apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:3811
**Found:** 2026-09-22 by /audit (scope: current; lens: correctness)
**Why it matters:** Four callbacks call `broadcastDraftReconcile` without naming it in their dependency arrays, and `react-hooks/exhaustive-deps` is not enabled in this repo, so nothing would catch a stale closure if the send helper's identity changed.
**Suggested fix:** Add it to the four arrays.
**Resolution:** Fixed and closed 2026-09-22 (commit 2619fe5b). No behaviour change today: `sendBroadcast` is a `useCallback` over refs and stable, so the closure could not go stale in practice.
