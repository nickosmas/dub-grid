# Feature: Configuration guides

**From build-plan:** feature 40b4
**Status:** verified
**Branch:** `feature/40b4-configuration-guides`

## Goal

The Configuration pages describe every customer Settings section as it ships,
each backed by source evidence and fingerprinted, with the two scaffold pages
they replace redirected so old links still land.

## Context

Current pages: `organization`, `shift-codes`, `focus-areas`, `coverage`,
`terminology`. Planned pages in the manifest: `schedule-rules-display`,
`roles-certifications-indicators`, `organization-activity-controls`,
`departments-focus-areas`, `shifts-jobs-absences`. The scaffold's "Settings >
Shift Codes" and "Staff Config" sections do not exist, and its "default shift
codes" table came from seed data (there are no defaults). The public-page rules
in the 40b1 archive apply. Subscription and billing belong to 40c.

Decision: `focus-areas` is replaced by `departments-and-focus-areas` and
`shift-codes` by `shifts-jobs-and-absences`. Each old page is deleted, its
manifest entry retired, and a permanent redirect added in `docs/docs.json` in
this feature, so no public URL breaks between features. 40c keeps the third
replaced page and any others it retires.

## Build steps

- [x] **1. Organization, labels, and activity and controls.**
  - Rewrite `organization.mdx` (Organization Details) and `terminology.mdx`
    (Labels); publish `organization-activity-and-controls.mdx`; record,
    fingerprint.
  - _Done when:_ `docs:check` passes with the three pages verified.
- [x] **2. Departments, roles, certifications, and schedule notes.**
  - Publish `departments-and-focus-areas.mdx` and
    `roles-certifications-and-indicators.mdx`; retire `focus-areas.mdx` behind a
    redirect; record, fingerprint.
  - _Done when:_ `docs:check` passes and the old URL redirects in `docs.json`.
- [x] **3. Shifts, jobs, absences, rules, display, and coverage.**
  - Publish `shifts-jobs-and-absences.mdx` and
    `schedule-rules-and-display.mdx`, rewrite `coverage-requirements.mdx`,
    retire `shift-codes.mdx` behind a redirect; add the new pages to the
    navigation; record, fingerprint.
  - _Done when:_ `docs:check` and `docs:verify` pass with every 40b page
    verified and no 40b page left planned.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- Organization Details, Labels, Activity Log and Delete Organization, Departments and Focus Areas, Roles/Certifications/Schedule notes, Shifts/Jobs/Absences, Schedule Rules and Display, and Coverage verified from source. Every 40b page is verified: 21 of 36 manifest pages carry evidence fingerprints, and no 40b page remains planned.
- `focus-areas` and `shift-codes` are deleted and permanently redirected (`docs/docs.json` `redirects`, validated by the pinned Mint) to their replacements; their manifest entries are removed, and the new pages carry their surfaces. 40c still owns the third replaced page.
- Corrected from the scaffold: "Settings > Organization" holding shift categories, Admins editing organization settings, an editable employee count, "Settings > Shift Codes" with invented default codes and fields, `canManageShiftCodes`, "Staff Config", focus-area colors and breaks, "Add Requirement" coverage rows, and "Custom Terminology".
- Worth a product look: the Schedule notes panel header still reads "Indicators" (`Indicators.tsx:577`); the Labels inputs stop at 30 characters while the validator allows 50; the scheduled departments label is stored but can't be renamed; the Activity Log's type filter includes an internal category.
