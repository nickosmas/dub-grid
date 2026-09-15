# Feature: Role-based setup and onboarding gates

**From build-plan:** feature 19b5a  
**Status:** completed

## Goal

Verify and repair the role-aware organization-setup and member-onboarding gates
across web and mobile. Each member must receive the right next action for their
role while an organization is incomplete, without returning a completed member
to onboarding or allowing an incomplete member into the application.

## In scope

- Web gate behavior for Super Admin, Admin, and User while setup is incomplete
  and while per-member onboarding is incomplete or complete.
- Mobile startup behavior for the same durable setup and onboarding states,
  including the device-local orientation screens that must not override the
  server-authoritative gate.
- Role-specific recovery and pending copy where the member cannot complete
  organization setup themselves.
- Focused regression coverage for role, completion, refresh, and retry paths.

## Out of scope

- Trial, grace-period, locked-organization, and billing-recovery behavior,
  which is 19b5b.
- The admission bootstrap, token rotation, and stale-state correctness repair
  completed in 19a.
- MFA, password recovery, invitations, and session lifecycle coverage from
  19b1 through 19b4.
- New onboarding content, role policy, or organization setup steps.

## Build steps

- [x] **Step 1 - map and lock web setup decisions by role** - audited the web
      onboarding gate and added Super Admin and Admin setup-capability regressions
      beside the existing User and pending-path coverage. _Done:_ each role reaches
      only its authorized setup, pending, or app path, while completed members stay
      in the app.
- [x] **Step 2 - align mobile startup with the durable gate** - verified that
      native orientation is device-local only and cannot supersede durable
      organization or member completion state. _Done:_ mobile startup tests cover
      the same durable gate boundaries, and completed members do not replay
      onboarding.
- [x] **Step 3 - cover cross-client recovery boundaries** - verified web
      organization-switch behavior plus mobile membership refresh and bootstrap
      cache identity. _Done:_ focused web/mobile tests prove authoritative role and
      completion decisions after refresh or transition without including
      trial/billing states.

## Files / areas

- `apps/web/src/__tests__/SetupLockGate.test.tsx`
- `apps/web/src/components/onboarding/OnboardingGate.tsx`
- `apps/web/src/components/onboarding/onboarding-decision.ts`
- `apps/web/src/features/onboarding/client/*`
- `apps/mobile/src/features/onboarding/screens/OnboardingScreen.tsx`
- `apps/mobile/src/features/auth/hooks/useMobilePermissionsRealtime.ts`
- `apps/mobile/src/features/auth/hooks/useBootstrap.ts`

## Data / contracts

- Durable organization membership completion and setup state remain
  authoritative. Device/session flags can only improve the transition, never
  grant access or force a completed member back to onboarding.
- Super Admin can be routed to organization setup. Admin and User may only see
  a role-appropriate pending/recovery state unless their existing permissions
  authorize the relevant setup action.
- No client infers a trial or billing decision in this feature. Those states
  remain delegated to 19b5b.
- Organization isolation and permission checks remain intact on every route and
  API input.

## Verification

- Focused web setup-gate test: 24 passed.
- Focused mobile entry, onboarding, and tab-gate tests: 20 passed.
- Focused web/mobile recovery-boundary tests: 36 passed.
- Final gate passed: `npm run test:web`, `npm run test:mobile`,
  `npm run type-check`, and `npm run build`.

## Manual review path

Sign in as each role against an incomplete organization, then complete setup
and member onboarding in separate sessions. The next sign-in must open the app
rather than replay onboarding.

## Notes

- 19a remains the protected admission baseline. This feature does not add a
  local completion shortcut or change its durable admission contract.
- Web retains organization setup authoring. Mobile can show a clear
  pending/recovery state but does not add configuration authoring.
