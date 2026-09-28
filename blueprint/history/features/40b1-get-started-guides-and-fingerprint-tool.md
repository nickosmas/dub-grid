# Feature: Get started guides and the fingerprint tool

**From build-plan:** feature 40b1
**Status:** verified
**Branch:** `feature/40b1-get-started`

## Goal

The four Get Started pages describe what DubGrid does today, each backed by the
source that proves it, and the accuracy manifest can record that proof.

## Context

The pages were an unverified AI scaffold (2026-09-22). Known drift: a separate
verification-email step (removed in `91711cec`), advisory "cell locks" (removed;
presence only), "Settings → Users" and "Settings → Staff Config" (not in
`nav-config.tsx`), "default shift codes" (none exist), and a "Pending
Organization Assignment" page. Nothing in the manifest can yet be marked
`verified`: there is no tool that writes a page's evidence fingerprint.

Pages: `home` (`docs/index.mdx`), `introduction`, `quickstart`, `onboarding`.

## Rules for every public page (40b to 40c)

- Customer behavior only. No Gridmaster tooling, Test Sandbox, feature flags,
  migrations, environment variables, or internal HTTP endpoints; `docs:check`
  enforces part of this.
- Every navigation path, button label, permission key, limit, and state names
  the source that shows it, listed in the page's manifest `sourceFiles` (and
  `testFiles` where a test pins the behavior).
- Customer copy says "Organization", "schedule notes" (never "indicators"),
  and treats focus-area, certification, and role labels as the organization's
  own terms, naming the default label once.
- Seed or demo data is never presented as a product default.
- No em dashes; follow `docs/AGENTS.md` for voice.

## Build steps

- [x] **1. `docs:fingerprint`.**
  - `scripts/documentation/fingerprint.ts --write <page-id>...` sets
    `sourceReview: "verified"` and the computed `evidenceFingerprint` for the
    named current pages, refusing a planned page, an unknown id, or a page
    whose evidence files are missing; it writes the manifest deterministically.
  - Root script `docs:fingerprint` (pinned `tsx`), classified in
    `source-policy.json`; the manifest joins `.prettierignore` as a
    machine-written file.
  - _Done when:_ fixture tests cover the write, each refusal, and a rerun
    changing nothing; `docs:check` passes.
- [x] **2. Home and introduction.**
  - Rewrite `docs/index.mdx` and `docs/introduction.mdx` from source; record
    their real `sourceFiles` and claims; fingerprint both.
  - _Done when:_ `docs:check` passes with both pages verified, and no claim
    lacks a cited source.
- [x] **3. Quickstart and onboarding.**
  - Rewrite the Super Admin first-run path (invitation, password, sign-in,
    terms, onboarding, trial) and the staff join path (invitation to first
    schedule view, web and mobile) from the invitation, auth, onboarding and
    accept-terms sources; fingerprint both.
  - _Done when:_ `docs:check` and `docs:verify` pass with the four Get Started
    pages verified.

## Verify

- `npm run type-check`, the docs tests, `npm run docs:check`,
  `npm run docs:verify`

## Result

- `docs:fingerprint` added with fixture tests; the manifest is machine-written and excluded from Prettier.
- Home, introduction, quickstart, and onboarding rewritten from source and verified: 4 of 36 manifest pages now carry evidence fingerprints.
- Corrected from the scaffold: no email-verification step, no cell locks, three organization roles (not four), no "Settings > Users" or "Staff Config", no default shift codes, a setup guide overlay instead of a `/setup` checklist, header tabs instead of a sidebar, and the real view labels.
- For 40d: the overview and item 40 plan still say 26 Admin permissions; the source has 25. `ScheduleGrid.tsx` and `MobileDayView.tsx` still tell people to add staff on a "Staff" page, which is now People.
