# Feature: Admission and onboarding state correctness

**From build-plan:** feature 19a
**Status:** verified

## Goal

Make the authenticated web admission gate wait for bootstrap data from the
effective organization before using any organization-scoped onboarding or
billing state. A completed member must remain in the app across refreshes and
organization changes without a stale response ever mounting onboarding for the
wrong organization.

## In scope

- Treat a bootstrap payload whose organization does not match the effective
  organization as unsettled for every organization-scoped gate decision, not
  only for wizard-phase freezing.
- Preserve the durable per-membership `onboarding_completed_at` contract and
  same-session completion guard: once either confirms completion for the
  effective organization, onboarding cannot be remounted by refetches.
- Add pure decision and `OnboardingGate` integration coverage for stale
  cross-organization data, completed members, initial incomplete members, and
  billing gates after reliable bootstrap resolution.
- Record the native distinction: mobile's introductory tour is device-local
  and unauthenticated, while a signed-in launch always takes precedence and
  never routes back to that tour.

## Out of scope

- Invitation, password recovery, MFA, revocation, rate limiting, or session
  security work, which belong to 19b through 19d.
- Changes to onboarding database fields, RPCs, mobile API contracts, or the
  mobile introductory-tour design.
- Reworking ordinary page loading or post-login transition presentation beyond
  the admission decision's existing settled/unsettled contract.

## Build loop

Build one reviewable step at a time. Each step keeps admission safe when data
is stale, then proves the result before proceeding.

## Build steps

- [x] **Step 1 - Lock reliable-bootstrap admission semantics** - update the
      pure onboarding decision so stale organization data cannot choose a
      wizard, pending screen, or billing redirect. _Done when:_ an unreliable
      organization payload returns the existing unsettled app decision, while
      reliable completed and incomplete states keep their current outcomes.
- [x] **Step 2 - Apply the guard through the web admission gate** - wire the
      reliable-bootstrap condition through `OnboardingGate` without changing
      the durable completion or session-marker precedence. _Done when:_ an
      effective-org switch with a previous org's bootstrap payload keeps the
      app mounted until the matching payload resolves, then applies the new
      org's correct admission state.
- [x] **Step 3 - Prove cross-session and native launch behavior** - add focused
      regression tests for completion, stale-org, billing, and signed-in mobile
      launch precedence, then run applicable verification. _Done when:_ the
      named paths pass without changing server-side membership completion
      semantics or routing a signed-in mobile user to the introductory tour.

## Files / areas

- `apps/web/src/components/onboarding/onboarding-decision.ts` and its tests.
- `apps/web/src/components/onboarding/OnboardingGate.tsx` and
  `apps/web/src/__tests__/SetupLockGate.test.tsx`.
- Existing mobile launch-gate tests only if a coverage gap is confirmed.

## Data / contracts

- `entryGate.onboardingCompleted` is server-derived from the authenticated
  user's `organization_memberships.onboarding_completed_at` for the effective
  organization. It is the cross-session source of truth.
- The web sessionStorage completion marker is keyed by both user and org and
  only bridges post-completion refetch timing. It must not replace server
  admission on a new session.
- `orgDataReliable` means `org.id === effective orgId`; an unreliable payload
  may not drive organization-scoped onboarding, setup-pending, or billing
  decisions.

## Testing

- Full web suite: 372 files, 3,180 tests passed.
- Full mobile suite: 124 files, 993 tests passed.
- `npm run type-check`, `npm run build`, and `git diff --check` passed.

## Notes for the AI

- This is an admission correctness repair, not a visual redesign. Reuse the
  existing unsettled `app` decision so ordinary refreshes retain page-level
  loading instead of a new full-screen blocker.
- Do not trust a client-provided organization id. The server bootstrap and
  completion route must stay authenticated and effective-org scoped.
- Keep `bootstrapUnavailable` recovery highest priority; unreliable data is
  distinct from failed data.
