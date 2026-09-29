# Feature: Mobile navigation, alerts, and reports guides

**From build-plan:** feature 40c1
**Status:** verified
**Branch:** `feature/40c1-mobile-alerts-reports`

## Goal

Publish the three planned pages for the DubGrid mobile app, alerts, and
reports, each backed by source evidence and fingerprinted.

## Context

Manifest pages `mobile-navigation`, `alerts`, `reports` are planned. The
public-page rules in the 40b1 archive apply. The app's store availability is
never claimed. Reports access depends on an organization-level switch and is
described as possibly unavailable. Internal alert categories (platform and
operator events) are left out.

## Build steps

- [x] **1. The DubGrid mobile app.**
  - Publish `docs/features/mobile-navigation.mdx`: first launch, sign-in,
    privacy and terms prompts, app lock, tabs by role, offline and error
    states, switching organization, signing out, and what stays on the web.
  - _Done when:_ `docs:check` passes with the page verified.
- [x] **2. Alerts and reports.**
  - Publish `docs/features/alerts.mdx` and `docs/features/reports.mdx`; add
    all three pages to the navigation.
  - _Done when:_ `docs:check` and `docs:verify` pass with the three pages
    verified.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- The DubGrid app, Alerts, and Reports pages published from source and verified: 24 of 36 manifest pages carry evidence fingerprints.
- Store availability is not claimed; Reports are described as possibly unavailable; internal alert categories are left out.
- Links to the account pages are added in 40c2, when those pages exist.
- Worth a product look: the Reports filters say "Focus areas" instead of the organization's own label; the privacy policy promises a self-serve data export that has no button (found during 40c2 research).
