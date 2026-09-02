# Feature: Mobile role certification eligibility

**From build-plan:** feature 17a
**Status:** verified

## Goal

Mobile staff editors receive each role's certification requirement and block new
incompatible role selections before save. Server validation remains authoritative,
and an already-selected role stays removable after a certification changes.

## Delivered

- Added `requiredCertificationIds` to authenticated mobile bootstrap roles from
  data access through contracts and API-core assembly.
- Moved the any-of certification predicate to `@dubgrid/domain`, retaining the
  web helper as a compatibility re-export.
- Added disabled role choices with accessible requirement explanations in both
  People staff detail and self-service work-profile editors.
- Preserved legacy incompatible selected roles so users can remove them.
- Added domain, contract, data-access, API-core, web compatibility, and mobile
  editor regression coverage for matching, missing, compact-label, and selected
  legacy-role behavior.

## Out of scope

- Canonical dashboard work remains in 17b and 17c.
- Schedule editing, publishing, and F-16 remain excluded by explicit user
  decision.
- No role/certification migration or settings-editor work was introduced.

## Verification

- `npm run type-check`
- `npm run lint`
- `npm run test`
- `npm run test:mobile`
- `npm run build`

All passed on 2026-08-31.

## Findings

### 17a/F-15 [P1] closed - Mobile role selection ignores certification requirements until save

**File:** apps/mobile/src/features/people/screens/PersonDetailScreen.tsx; apps/mobile/src/features/profile/screens/ProfileWorkScreen.tsx; packages/data-access/src/mobile.ts
**Found:** 2026-08-31 by /audit (scope: mobile parity; lenses: quality, security, tests)
**Why it matters:** Mobile previously allowed incompatible role selection and only learned of the requirement when the server rejected the save.
**Resolution:** The bootstrap role contract now includes requirements; both editors block incompatible new selections with accessible explanations while retaining selected legacy roles for removal. A final audit re-reviewed the data-access query, authenticated bootstrap route, shared predicate, server validation, and editor paths with passing focused and full verification evidence.

### 17a/F-16 [P1] accepted - Mobile managers cannot edit or publish schedules

**File:** apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx; apps/mobile/src/shared/lib/api.ts
**Found:** 2026-08-31 by /audit (scope: mobile parity; lenses: quality, security, tests)
**Why it matters:** This remains a functional web/mobile difference.
**Resolution:** Accepted by the user on 2026-08-31: “i dont want F16 at all.” Mobile schedule editing and publishing remain explicitly excluded from this release-catch-up work.
