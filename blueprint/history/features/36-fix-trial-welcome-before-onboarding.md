# Feature: Fix trial welcome appearing before onboarding completes

**From build-plan:** feature 36
**Status:** verified

## Goal

On a super admin's first login the "Your trial has started!" modal opens
while onboarding is still going. The trial clock starts on exactly that
sign-in (`start_trial_for_org`), which is the same sign-in that walks the
super admin through the wizard, so the two collide by construction.

`TrialWelcomeModal`'s `enabled` checked org, super-admin, gridmaster,
impersonation and terms acceptance - never onboarding. The header's trial
pill was already held back for this reason (`AppShell`'s
`hideForSetupLock` includes `entryGate?.onboardingCompleted !== true`), but
that variable lives in `AppHeader`, a different component from the one that
renders the modal, so the modal had no equivalent guard.

## The fix

`TrialWelcomeModal` now requires `entryGate.onboardingCompleted === true`
as well, reading it from `useOrganizationData` - the same server-side
completion flag the pill uses, deliberately not the session latch that lets
the app paint before the server has recorded completion.

The hook is gated on `isWelcomeCandidate` (the pre-existing conditions),
and `AppShell` now mounts the modal only on authenticated app routes.

Both of those were needed, and the e2e suite found each in turn:

1. An ungated `useOrganizationData` put bootstrap queries on the sign-in
   page; `login.spec.ts` and `dashboard-states.spec.ts` timed out filling
   the login form. Gating the hook fixed it (those two specs went from
   2.2m to 21.5s).
2. `enabled` only covers the bootstrap query _inside_
   `useOrganizationData` - its `useOrgContext` lookup is not gated by it -
   so `/api/account/org-context` still fired on public routes and logged a
   401 for signed-out visitors. `auth-release-qualification.spec.ts`
   caught that through its runtime-failure collector (7 failures, all
   401s). Mounting the modal only for an authenticated app route removes
   the mount entirely, which is also stricter than the previous
   behavior.

## Build steps

- [x] **Step 1 - Confirm the gap.** `enabled` in `TrialWelcomeModal.tsx`
      carries no onboarding condition; `hideForSetupLock` in `AppShell.tsx`
      shows the intended one and is out of reach from the modal's render
      site.
- [x] **Step 2 - Add the guard, keep it off public routes.** Require the
      server's `onboardingCompleted`, and disable the lookup entirely until
      the caller is a welcome candidate.
- [x] **Step 3 - Test.** New `TrialWelcomeModal.test.tsx`: shows once
      onboarding is complete; stays closed while it is in progress; stays
      closed before the entry gate resolves. Verified to fail without the
      fix (the trial-welcome fetch fires in both closed cases) and pass
      with it.
- [x] **Step 4 - Regression.** `tsc --noEmit` clean; `dashboard-states`
      (which drives the real overlay) and `login` green.

## Files / areas

- `apps/web/src/components/TrialWelcomeModal.tsx` - the guard
- `apps/web/src/components/AppShell.tsx` - mount only on authenticated app routes
- `apps/web/src/__tests__/TrialWelcomeModal.test.tsx` - new

## Notes

Worth remembering beyond this item: `useOrganizationData({ enabled })`
gates only its bootstrap query, not the org-context lookup it composes. Any
component that calls it on a route an unauthenticated visitor can reach
will still issue that request.
