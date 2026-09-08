# Feature: Trial and billing recovery gates

**From build-plan:** feature 19b5b  
**Status:** completed

## Goal

Prove that trial and billing states lead every web and mobile member to the
correct, role-appropriate destination. Super Admins must be able to recover an
organization's billing without bypassing authorization, while Admins and Users
must receive an honest pending or unavailable state and never regain app access
until the organization is open.

## In scope

- Web organization-access decisions for trial pending, active, grace, locked,
  payment-attention, suspended, and archived states.
- Web recovery routing for Super Admins and terminal organization-gate behavior
  for Admins and Users.
- Mobile locked-state copy, grace detail, retry behavior, and the
  Super-Admin-only link to web billing.
- Exact regression coverage for status transitions and role restrictions across
  the access-status API, onboarding gate, and mobile organization-status route.

## Out of scope

- Stripe checkout, webhooks, prices, seat calculations, or new billing UI.
- Gridmaster billing operations beyond the existing platform-role access
  contract.
- Setup and member-onboarding gates completed in 19b5a.
- Admission bootstrap correctness from 19a, plus resilience, security, and
  release qualification in 19c through 19e.

## Build steps

- [x] **Step 1 - lock the web organization-access role matrix** - added an
      explicit billing-recovery capability to the onboarding decision and routed
      non-recovery roles to the terminal organization gate. Expanded the
      access-status tests across pending, grace, payment-attention, suspended, and
      locked states.
- [x] **Step 2 - verify web recovery handoff and reopen behavior** - made manual
      recovery reload exactly once and proved completed Super Admins remain in the
      app after billing recovery without replaying setup or onboarding.
- [x] **Step 3 - align mobile locked-state recovery** - added truthful mobile
      detail for pending, ending, grace, payment-attention, locked, and suspended
      states; preserved Super-Admin-only web billing access; and proved bootstrap
      remains authoritative during retry.

## Files / areas

- `apps/web/src/components/onboarding/onboarding-decision.ts`
- `apps/web/src/components/onboarding/OnboardingGate.tsx`
- `apps/web/src/app/api/organization/access-status/route.test.ts`
- `apps/web/src/app/(app)/billing-required/OrganizationGateScreen.tsx`
- `apps/mobile/src/features/auth/screens/OrganizationLockedScreen.tsx`
- `apps/mobile/src/features/auth/hooks/useTabsGate.test.tsx`
- `apps/web/src/features/mobile/server/routes/org-status.test.ts`
- Focused tests beside each changed component and decision boundary.

## Data / contracts

- `evaluateOrganizationBillingAccess` remains the single state evaluator for
  web, proxy-compatible access status, and mobile org status. Clients do not
  infer eligibility from Stripe fields directly.
- `trial_pending` holds Admins and Users but permits the eligible Super Admin
  recovery path. `active`, `trial_ending_soon`, and `trial_grace` remain open;
  `locked`, suspended, and archived states do not.
- The web access-status endpoint returns only `{ available, state }` and retains
  the proxy-compatible cache key. The mobile status route exposes only the
  state, lock flag, grace end, and normalized role needed for recovery copy.
- Billing authoring remains web-only and available from mobile only through the
  existing Super Admin recovery link.

## Verification

- Focused web role and recovery matrix: 65 tests passed.
- Focused mobile lock and server status matrix: 30 tests passed.
- Full web suite: 378 files and 3,221 tests passed.
- Full mobile suite: 124 files and 1,002 tests passed.
- `npm run type-check` passed.
- `npm run build` passed.

## Manual review path

Use a Super Admin and a regular member in the same held organization. Only the
Super Admin should reach billing recovery. Restore the organization, then use
the next check on each client and confirm the app opens without restarting
onboarding.

## Notes

- The proxy remains the authorization gate; client status responses are
  presentation and recovery signals only.
- The durable admission contract from 19a remains intact.
- No Stripe implementation, prices, seat calculations, or billing-authoring
  surface changed.
