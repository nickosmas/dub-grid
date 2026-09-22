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
