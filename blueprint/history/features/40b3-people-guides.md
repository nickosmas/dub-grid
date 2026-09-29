# Feature: People guides

**From build-plan:** feature 40b3
**Status:** verified
**Branch:** `feature/40b3-people-guides`

## Goal

The roster, person detail, and invitations pages describe how people are added,
invited, and managed as the product ships, each backed by source evidence and
fingerprinted in the accuracy manifest.

## Context

Pages: `roster` (`docs/staff/roster.mdx`), `person-detail`
(`docs/staff/detail-page.mdx`), `invitations` (`docs/staff/invitations.mdx`).
Scaffold drafts from 2026-09-22. The public-page rules in the 40b1 archive
apply. Known areas that changed since the scaffold: the staff status lifecycle
and its scheduling effects (067), canonical email, invitation reissue in place
with a 72-hour absolute expiry, and step-up for sensitive staff changes.

## Build steps

- [x] **1. Roster.**
  - Rewrite `docs/staff/roster.mdx`; record sources and tests; fingerprint.
  - _Done when:_ `docs:check` passes with the page verified.
- [x] **2. Person detail and invitations.**
  - Rewrite `docs/staff/detail-page.mdx` and `docs/staff/invitations.mdx`;
    record and fingerprint.
  - _Done when:_ `docs:check` and `docs:verify` pass with the three People
    pages verified.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- People, person page, and invitations rewritten from source and verified: 13 of 36 manifest pages now carry evidence fingerprints.
- Corrected from the scaffold: a `/staff` route (it is `/people`), "benched" and "terminated" (Active, Inactive, Removed), "Add Employee" with roles, phone and seniority fields, person-page tabs for schedule and reports (Profile, Overview, Activity), a Settings > Users invite flow, invitees needing to exist on the roster first, a waiting page for role assignment, and an email-verification step.
- Worth a product look: invite permission differs by entry point (person page needs manage-staff; the directory's invite needs Super Admin); the roster's "Roles" header and the profile-request queue's labels are hardcoded rather than the organization's own; the app's status filter has no Removed option.
