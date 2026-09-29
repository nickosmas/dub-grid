# Feature: Account guides

**From build-plan:** feature 40c2
**Status:** verified
**Branch:** `feature/40c2-account-guides`

## Goal

Publish the profile, security and sessions, and notification, privacy, and
data-control pages from source, fingerprinted, and link the 40c1 pages to them.

## Context

Manifest pages `profile`, `security-sessions`, `privacy-controls` are planned.
The public-page rules in the 40b1 archive apply. The privacy policy promises a
self-serve data export that no screen offers, so the guide does not promise
it; that is flagged for a product decision. Reset link and code lifetimes are
not stated, since production's value was not read.

## Build steps

- [x] **1. Profile.**
  - Publish `docs/account/profile.mdx`.
  - _Done when:_ `docs:check` passes with the page verified.
- [x] **2. Security and sessions, and notifications, privacy, and data.**
  - Publish the two pages, add an Account navigation group, and link the app
    and alerts pages to them.
  - _Done when:_ `docs:check` and `docs:verify` pass with the three pages
    verified.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- Your Profile, Security and Sessions, and Notifications, Privacy, and Data published from source and verified, in a new Your Account navigation group; the app and alerts pages now link to them. 27 of 36 manifest pages carry evidence fingerprints.
- For a product decision: the Privacy Policy (`apps/web/src/app/privacy/page.tsx:466`) promises a self-serve data export from profile settings, but no web or app screen calls the export; the guide points to support instead.
- Worth a product look: web lets a Super Admin edit their own name directly, while the app requires manage-people permission; the app groups alert preferences into three categories where the web has seven, and one app description uses internal wording.
