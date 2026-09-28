# Feature: Source-derived inventory and documentation contract

**From build-plan:** feature 40a
**Status:** verified
**Branch:** `feature/40a-docs-inventory`

## Context

40a began on 2026-09-23 and stopped when item 40 was deferred behind item 41.
Its work survived only as untracked files in the shared checkout:

- `scripts/documentation/` (`inventory.ts`, `contract.ts`, `generate.ts`,
  `check.ts`)
- `internal/documentation/` (`source-policy.json`, `accuracy-manifest.json`,
  `generated/`)
- `apps/web/src/__tests__/docs-inventory.test.ts` and `docs-contract.test.ts`
  (23 fixture tests, passing)
- the `docs/AGENTS.md` command section and the E2E declarations in
  `apps/web/.env.example`

The original spec and the `docs:*` package scripts were lost. Item 40 left
`build-plan.md` in revert `0a7eb2e05` and is restored from `f7145a6ea`,
resumed on 2026-09-28 at the owner's request while 41d is still open.

Checked against `dev` at `1b86aad5`: the inventory covers all ten source
categories in the plan, but:

1. `docs:check` throws because the source policy names five `docs:*` scripts
   that do not exist.
2. The committed inventory is stale.
3. The manifest's `invitations` page names `web:/verify-email`, which
   `91711cec` removed.
4. `test:e2e:production` is unclassified, and nothing fails on an
   unclassified root script (environment keys already fail both ways).
5. The manifest's frozen candidate is `9b5b1c94`, from 2026-09-23.

## Scope

No product API, database schema, UI behavior, or public guide text changes.
Public guide rewrites are 40b and 40c; the living engineering references are
40d; hooks, CI gates, and runtime evidence are 40e.

## Build steps

- [x] **1. Wire and pin the tooling.**
  - Root `docs:inventory`, `docs:check`, `docs:validate`, `docs:links` and
    `docs:verify` scripts, with Mintlify pinned to an exact `mint@` version.
  - Classify `test:e2e:production`; make an unclassified root script fail
    `collectSupportedCommands` the same way an unclassified environment key
    fails, with a fixture test.
  - Keep the `docs/AGENTS.md` command section and the `.env.example` E2E
    declarations.
  - _Done when:_ the fixture tests pass, including the new unclassified-script
    case, and `npm run type-check` passes.
- [x] **2. Refresh to the current candidate.**
  - Drop `web:/verify-email` from the `invitations` page, set
    `frozenProductCandidate` to this branch's base commit on `dev`, and
    regenerate the inventory with `npm run docs:inventory`.
  - _Done when:_ `npm run docs:check` exits 0 and running
    `npm run docs:inventory` again changes nothing.
- [x] **3. Mintlify validation baseline.**
  - Run `npm run docs:validate` and `npm run docs:links` with the pinned
    version. Fix configuration errors in `docs/docs.json` only; any failure
    inside guide content is recorded as a manifest `pending` note owned by
    40b or 40c, not fixed here.
  - _Done when:_ `npm run docs:verify` exits 0, or every remaining failure is
    listed in this spec against its owning sub-feature.
  - Result: every Mint release back to July (`4.2.655`) crashes on
    `openapi-types`, which `@mintlify/scraping` imports but declares only as a
    dev dependency; the scripts install it beside Mint. `validate` also warned
    that the scaffold's remote `brand.dev` favicon could not load, so
    `docs.json` now uses `docs/favicon.png`, a copy of the web app's icon.
    No guide-content failures.

- [x] **4. Repair F-114 and F-118 - the contract checker's gaps.**
  - Reject unknown `lifecycle`, `sourceReview`, `deliveryOwner` and
    `reasonCode` values; under `requireClosed`, every non-planned page must be
    `verified`.
  - Reject a surface both excluded and documented, a `publicRoute` that does
    not match `file`, and manifest paths outside the repository; skip the
    fingerprint when evidence is missing; accept only files as link targets.
  - _Done when:_ a fixture test per case (F-120) passes and `docs:check` still
    passes on the real manifest.
- [x] **5. Repair F-116 and F-115 - the inventory parsers.**
  - `ALTER TABLE ONLY` and multi-table `DROP TABLE` in RLS folding.
  - Environment keys from root config files, `playwright.config.ts`, `e2e/`
    and root `scripts/`, `process.env?.X`, destructured `process.env`, and
    commented `# KEY=` example lines; classify the newly found keys.
  - _Done when:_ fixture cases for each form pass, `SENTRY_DSN` is in the
    inventory, and the E2E keys list `apps/web/.env.example`.
- [x] **6. Repair F-117 and F-119 - digest, job categories, pinned tsx.**
  - The digest covers the extracted facts, not source file bodies, so an edit
    that changes no fact leaves the inventory current.
  - Workflow and Vercel jobs are classified in `source-policy.json`; an
    unclassified job fails.
  - `docs:inventory` and `docs:check` run an exact `tsx@` version.
  - _Done when:_ fixture tests cover the unclassified job and the
    comment-only edit, the inventory is regenerated on the rebased branch,
    and `docs:verify` passes.

## Verify

- `npm run type-check`, the two `docs-*.test.ts` files, `npm run docs:check`,
  `npm run docs:verify`
- For 40d: the inventory counts 25 Admin permissions (`canEditScheduleIndicators`
  is gone); the overview and other references still say 26.
- Determinism: two `npm run docs:inventory` runs give identical output.

## Findings

### 40a/F-114 [P2] closed - The closing gate passes a manifest with unknown lifecycle or review values

**File:** `scripts/documentation/contract.ts:141`, `:208`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** `--require-closed` (40e's gate) counts only `lifecycle === "planned"` and `sourceReview === "pending"`, and nothing checks the fields hold allowed values. A scratch manifest with `sourceReview: "done"` and `lifecycle: "retired"` returned no errors with 0 verified and 0 pending, so the gate closed with no page verified and the fingerprint and semantic checks never ran.
**Suggested fix:** reject any `lifecycle`, `sourceReview`, `deliveryOwner` or `reasonCode` outside its union; under `requireClosed`, require every non-planned page to be `verified`; fixture cases for both.
**Resolution:** Fixed in 40a step 4: `validateAccuracyManifest` rejects a `lifecycle`, `sourceReview`, `deliveryOwner` or `reasonCode` outside its union and a planned page marked verified, and under `requireClosed` names every non-planned page that is not `verified`. Fixture tests cover each value and a contract that genuinely closes; the rejection tests fail against the previous `contract.ts`. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): `enumErrors` checks all four unions and `requireClosed` names every unverified current page; a closing contract is tested; closed.

### 40a/F-115 [P2] closed - Environment-key discovery misses real keys, including `SENTRY_DSN`

**File:** `scripts/documentation/inventory.ts:1151`, `:1200`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** the inventory claims a complete classified key list, but `SENTRY_DSN` (`apps/web/sentry.server.config.ts:10`) is absent because root config files are not scanned. Also missed: `E2E_PRODUCTION_PORT` and `E2E_LOGIN_EMAIL_LIMIT_PER_15_MIN` (read through an aliased `env.` in `scripts/run-production-e2e.mjs`), keys in `playwright.config.ts` and `e2e/`, `process.env?.X`, and destructured `process.env`. Commented example lines (`# KEY=`) are skipped, so the `.env.example` E2E declarations this feature kept are never seen.
**Suggested fix:** scan `apps/*/*.config.ts`, `playwright.config.ts` and `e2e/`; accept `#\s*KEY=` in example files; match `process.env?.` and destructuring; classify the new keys; fixture cases per form.
**Resolution:** Fixed in 40a step 5: `environmentReadsIn` reads `process.env.X`, `process.env?.X`, bracket and destructured forms and uppercase `env.X` / `env?.X` on an `env` object; discovery also scans root and app-level config files and `e2e/`, reads schema properties in the `env` modules (`safeParse(process.env)`), accepts commented `# KEY=` example lines, and skips test and spec files. Twenty real keys were added to the policy (among them `SENTRY_DSN`, the login limits, `RESEND_FROM_EMAIL`, `EXPO_ACCESS_TOKEN`, the Vercel API keys) and four test-only keys removed; the inventory lists 72 keys. The fixture test fails against the previous `inventory.ts`. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): `SENTRY_DSN`, the `e2e/` helpers, commented example lines, destructured and optional-chained reads are found. The review's two follow-ups were repaired before closing: `env` members in workflow YAML are no longer read (dropping `NODE_VERSION`, a workflow constant), and E2E spec files are scanned again so `AUTH_ENTRY_SAMPLES` is classified; only unit tests are skipped. Closed.

### 40a/F-116 [P2] closed - RLS folding misreads `ALTER TABLE ONLY` and multi-table `DROP TABLE`

**File:** `scripts/documentation/inventory.ts:1045`, `:1076`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** neither regex allows `ONLY`, which `001` uses throughout, so `ALTER TABLE ONLY public.a DISABLE ROW LEVEL SECURITY` leaves `a` listed as RLS-enabled; `DROP TABLE public.a, public.b` drops only `a`. No current migration hits either form (the 43 tables match the local database), but the next one would publish a false security claim.
**Suggested fix:** `(?:ONLY\s+)?` in the alter patterns, split the drop list on commas, and fixture cases for both.
**Resolution:** Fixed in 40a step 5: the RLS and rename patterns accept `ALTER TABLE ONLY`, and `DROP TABLE` splits its list and ignores `CASCADE`/`RESTRICT`. The real inventory still lists 43 tables. The fixture test fails against the previous `inventory.ts`. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): `ONLY` is accepted in the RLS and rename patterns and drop lists split; function bodies are stripped before matching, so a drop inside a function cannot match. Closed.

### 40a/F-117 [P2] closed - The inventory digest hashes whole source files, so almost any edit makes it stale

**File:** `scripts/documentation/inventory.ts:1314`; `scripts/documentation/check.ts:37`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** `sourceDigest` reads the full contents of every referenced file (461, 53 of them tests), and `docs:check` compares the committed output byte for byte, so a comment change in any route or env-reading file fails the check. Harmless while nothing runs it; once 40e wires it into hooks and CI every feature must regenerate the inventory.
**Suggested fix:** digest the extracted facts rather than file bodies, or record in the spec that this churn is intended before 40e wires the gate.
**Resolution:** Fixed in 40a step 6: `inventoryDigest` hashes the extracted facts, so an edit that changes no fact leaves the inventory current (a comment appended to `api/health/route.ts` left `docs:check` passing); migration checksums are facts and still move the digest. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): the digest hashes facts only; migration checksums are facts, so a changed migration still moves it. Closed.

### 40a/F-118 [P3] closed - Contract checker edge cases: overlapping coverage, unchecked routes, crashes and out-of-repo paths

**File:** `scripts/documentation/contract.ts:141`, `:168`, `:193`; `scripts/documentation/check.ts:122`, `:290`, `:347`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** a surface can be both excluded as internal and documented on a published page; `publicRoute` is never compared with `file`; a verified page whose evidence file was deleted crashes the check (ENOENT in `computePageFingerprint`) and hides every other diagnostic; a link to a directory passes, and with an anchor throws EISDIR; manifest paths like `../../etc/hosts` are read and hashed. Each was reproduced in a scratch fixture; none affects today's manifest.
**Suggested fix:** reject excluded-and-documented surfaces, derive the route from `file`, skip the fingerprint when evidence is missing, accept only files as link targets, and reject paths that resolve outside `repoRoot` as `inventory.ts:181` does.
**Resolution:** Fixed in 40a step 4: surfaces both excluded and documented, a `publicRoute` that differs from `publicRouteForFile(file)`, and page, evidence or exclusion paths outside the repository are manifest errors; `checkPublicDocumentation` skips the fingerprint when evidence is missing or outside the repository; link targets must be files. The real manifest passes (all 36 routes derive from their files). Fixture tests fail against the previous scripts. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): directory links, the missing-evidence skip, `isInsideRepository` and `publicRouteForFile` checked against edge cases and all 36 real routes. Closed.

### 40a/F-119 [P3] closed - Scheduled-job categories are guessed, and `tsx` is not pinned

**File:** `scripts/documentation/inventory.ts:1288`; `package.json:46`
**Found:** 2026-09-28 by `/audit` (scope: current, 1b86aad5..1cc2be3e; all lenses)
**Why it matters:** the nightly E2E workflow is categorized `product` because only `dependency-audit` is hard-coded as maintenance, and 40c will source customer-facing jobs from this field. `docs:inventory` and `docs:check` run `npx tsx`, which is not installed, so they use whatever `tsx` is current while Mint is pinned (the repo's other root scripts do the same).
**Suggested fix:** classify workflows in `source-policy.json` and fail on an unclassified cron; run `npx --yes tsx@<exact>` or add `tsx` as an exact devDependency.
**Resolution:** Fixed in 40a step 6: scheduled jobs are classified in `source-policy.json` (`scheduledJobs`; the nightly E2E run is `repository-maintenance`), and an unclassified or stale job fails the inventory; `docs:inventory` and `docs:check` run `tsx@4.23.15`. Re-review 2026-09-28 (`/audit`, repairs on feature/40a-docs-inventory): `scheduledJobs` classification with unclassified and stale failures, nightly E2E as maintenance, `tsx@4.23.15` pinned. Closed.
