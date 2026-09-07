# Feature: Canonical mobile dashboard metrics

**From build-plan:** feature 18b1
**Status:** verified

## Goal

Extend the authenticated mobile dashboard payload with authoritative,
permission-safe metrics for schedule drafts while retaining the shared coverage
calculation already used by web and mobile. Native presentation remains
unchanged; the next dashboard-experience feature will consume these facts.

## In scope

- Define a stable mobile dashboard metrics contract for draft changes alongside
  coverage, open-gap, and pending-approval metrics.
- Derive draft-new, draft-modified, and draft-deleted counts from the same
  draft-versus-published schedule state that drives web's dashboard.
- Return these values only when the authenticated member can edit schedule
  drafts; otherwise redact them rather than exposing a misleading zero.
- Preserve existing coverage calculation, date-range behavior, role
  authorization, and dashboard cache contracts.

## Out of scope

- Historical trend data and period-history loading, which remain feature 18b2.
- Native dashboard UI, schedule editing, publishing, or web-dashboard
  presentation, which remain outside this feature.

## Build steps

- [x] **Step 1 - Lock the draft-metrics contract** - added a nullable,
      self-consistent draft summary and pure counting coverage.
- [x] **Step 2 - Load authoritative draft metrics** - added framework-neutral
      draft/published comparison semantics and permission-safe loader wiring.
- [x] **Step 3 - Expose and prove the API boundary** - passed authenticated
      schedule-edit permission and effective-org comparisons through the route,
      with mobile parser coverage.

## Verification

- Focused mobile dashboard route tests passed (6 tests).
- Focused mobile API tests passed (22 tests).
- Shared contracts and mobile API core tests, builds, and type checks passed.
- Full web suite passed: 372 test files, 3,178 tests.
- Full mobile suite passed: 123 test files, 988 tests.
- `npm run type-check`, `npm run build`, formatting, and `git diff --check`
  passed.

## Notes for the AI

- `draftSummary: null` is deliberate redaction. A zero summary means the
  member is authorized and has no draft changes.
- The route derives draft access from server-authenticated permissions and
  always scopes comparison reads to the effective organization.
