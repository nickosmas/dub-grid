# Feature: 40d. Current engineering, architecture, security, and operations references

**Type:** Feature
**Status:** verified
**Branch:** `feature/40d-engineering-references`

## Goal

The living engineering references describe the current `dev` accurately, the
Blueprint overview is regenerated from the plans, and historical records are
framed as point-in-time evidence without rewriting what they found.

## Context

About 10,000 lines of root and `internal/` references plus the app `AGENTS.md`
files. These are internal and not covered by `docs:check`; accuracy is proven by
reviewed diffs that cite the source for each changed fact. Known drift: 26 Admin
permissions (there are 25), migrations "through 027" or "049" (the stream is
through 075), removed cell locks, and paths and commands that moved. Historical
records keep their findings verbatim and gain a dated framing note.

## Build steps

- [x] **1. Plans and overview.**
  - Update `blueprint/project-plan.md` facts that drifted and regenerate
    `blueprint/context/project-overview.md` from the two plans.
  - _Done when:_ the overview matches the plans and `docs:check` passes.
- [x] **2. Architecture and security references.**
  - _Done when:_ every changed fact cites its source in the review, and no
    stale count, path, or removed mechanism remains.
  - [x] **2a. System architecture.** Reconcile `ARCHITECTURE.md`.
  - [x] **2b. RBAC and security model.** Reconcile `RBAC_SYSTEM_DESIGN.md`,
        `SECURITY.md`, `SYSTEM_FLOWCHARTS.md`, `internal/authentication.md`, and
        `internal/mfa-provider-boundary.md`.
  - [x] **2c. API and source map.** Reconcile `internal/api-reference.md` and
        `internal/architecture/folder-structure.md`.
- [x] **3. Setup, operations, and agent guides.**
  - Reconcile `README.md`, `CONTRIBUTING.md`, `apps/web/AGENTS.md`,
    `apps/mobile/AGENTS.md`, `docs/AGENTS.md`, `internal/secrets-rotation.md`,
    `internal/cookies-and-gdpr.md`, and `internal/mobile-release-qualification.md`.
  - _Done when:_ every documented command exists in `package.json`, every path
    exists, and changed facts cite their source.
- [x] **4. Historical records.**
  - Add a dated point-in-time note to `SECURITY_AUDIT.md`,
    `POTENTIAL_BUGS.md`, `code_review.md`, `AUTH_EDGE_CASES.md`, `PRD.md`, and
    the `internal/operations/` qualification records; `CHANGELOG.md` is
    reviewed for accuracy of what it records.
  - _Done when:_ each record says when it was true and where current behavior
    is documented, with its findings unchanged.

## Verify

- `npm run docs:check`, `npm run docs:verify`, `npm run type-check` (no code
  changes expected)

## Outcome

- Corrected the architecture and internal folder-map migration watermark to
  `075`, the current end of the checksum-locked migration stream.
- Corrected the generated-types guidance: `npm run gen:types` is deprecated
  because its former output no longer exists, while hand-written row types live
  in `packages/db-types`.
- Removed a brittle route-handler count from the web agent guide and verified
  the remaining referenced commands and source paths against the repository.
- Added clear point-in-time framing to historical audit, product, changelog,
  and operations records without changing their recorded findings.
- `npm run docs:verify` passed with 31 published, 0 planned, 0 pending, 31
  verified pages and 3 exclusions; Mintlify validation and link checks passed.
- `npm run type-check` passed: 24 of 24 tasks successful.
