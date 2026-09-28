# Feature: Scheduling guides

**From build-plan:** feature 40b2
**Status:** verified
**Branch:** `feature/40b2-scheduling-guides`

## Goal

The six scheduling pages describe the schedule as it ships on the web and in the
DubGrid mobile app, each backed by source evidence and fingerprinted in the
accuracy manifest.

## Context

Pages: `schedule-grid`, `draft-publish`, `recurring-shifts`, `realtime`,
`shift-requests`, `dashboard`. They are scaffold drafts (2026-09-22) and are
expected to carry the same drift 40b1 found: removed cell locks, invented
labels, and missing mobile and call-off behavior. The public-page rules in the
40b1 archive apply (customer behavior only, cited sources, "schedule notes",
organization labels, no seed data as defaults, no em dashes).

A behavior that depends on an organization-level switch is described as
possibly unavailable without naming the switch.

## Build steps

- [x] **1. Schedule grid and draft and publish.**
  - Rewrite `docs/features/schedule-grid.mdx` and
    `docs/features/draft-publish.mdx`; record their sources and tests;
    fingerprint both.
  - _Done when:_ `docs:check` passes with both verified.
- [x] **2. Recurring shifts and working together.**
  - Rewrite `docs/features/recurring-shifts.mdx` and
    `docs/features/real-time-collaboration.mdx`; record and fingerprint.
  - _Done when:_ `docs:check` passes with both verified.
- [x] **3. Shift requests and the dashboard.**
  - Rewrite `docs/features/shift-requests.mdx` and
    `docs/features/dashboard.mdx`; record and fingerprint.
  - _Done when:_ `docs:check` and `docs:verify` pass with the six scheduling
    pages verified.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- Schedule grid, draft and publish, recurring shifts, working together, shift requests, and dashboard rewritten from source and verified: 10 of 36 manifest pages now carry evidence fingerprints.
- Corrected from the scaffold: "1W/2W" labels, automatic saving (edits need **Confirm**), clearing by selecting OFF, search that filters (it highlights), print options, publishing every draft (it publishes the period on screen), discard removing everyone's drafts (it defaults to your own; all is Super Admin only), a draft recovery prompt (none), "Apply Recurring Schedule" (it is **Auto Fill**, which also needs edit permission), cell locks (removed), presence for every viewer (editors only), pickup as taking an open shift (it offers your own), approvals landing as drafts (they publish directly), and invented dashboard KPIs.
- Deliberately not promised: that others can claim the open shift an approved time-off request leaves (a known defect is recorded in that path), and exact schedule-note mark styling, which is changing.
- Hardcoded labels that ignore organization terminology remain in `RecurringScheduleSection.tsx:900` ("All Focus Areas") and dashboard fallbacks; worth a product fix.
