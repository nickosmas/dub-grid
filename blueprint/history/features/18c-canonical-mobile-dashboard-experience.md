# Feature: Canonical mobile dashboard experience

**From build-plan:** feature 18c
**Status:** verified

## Goal

Finish the native presentation of the authenticated dashboard model by making
schedule editors' canonical unpublished-draft summary visible in the mobile
dashboard. Keep the existing cards and expanded read-only screens intact, and
do not reintroduce Trends.

## In scope

- Present a schedule editor's non-null `metrics.draftSummary` as a compact,
  read-only dashboard card that explains the total and its new, modified, and
  deleted classifications.
- Render that card only when at least one draft change exists; a redacted
  summary (`null`) and an authorized zero remain invisible to non-editors and
  to dashboards without work to review.
- Preserve the existing canonical cards and their detail routes for coverage,
  open shifts, overtime, pending approvals, activity, and personal schedule.
- Add focused native component and screen coverage for the visible, zero, and
  permission-redacted states.

## Out of scope

- Trends, period-history data, charts, or any dashboard Trends control on web
  or mobile.
- Mobile schedule editing, schedule publishing, new API fields, or changes to
  web dashboard ordering.

## Build steps

- [x] **Step 1 - Add the native draft-summary card** - created a reusable,
      read-only dashboard card for a non-zero authoritative draft summary.
- [x] **Step 2 - Integrate the card into the dashboard** - placed the card in
      the existing mobile dashboard without disturbing current card order or
      rendering empty content.
- [x] **Step 3 - Prove the native state contract** - covered visible, zero,
      and redacted rendering and ran the applicable mobile verification.

## Data / contracts

- Consumes the existing `MobileDashboardResponse["metrics"]["draftSummary"]`.
  `null` remains authorization redaction, while `{ total: 0 }` remains an
  authorized absence of draft changes. The schema, API route, cache key, and
  `loadMobileDashboardPayload` behavior are unchanged.

## Verification

- Focused native dashboard tests passed: 19 assertions.
- `npm run test:mobile` passed: 124 test files, 993 tests.
- `npm run type-check`, `npm run build`, and `git diff --check` passed.

## Notes for the AI

- The card is React Native presentation only, uses existing mobile primitives
  and tokens, and is never a schedule-edit or publish control.
- Trends remain removed everywhere.
