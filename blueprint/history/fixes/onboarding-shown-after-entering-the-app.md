# Onboarding shown after a member is already using the app

**Type:** Fix

**Status:** verified

## The problem

Two related re-entry bugs in the onboarding gate.

1. **Onboarding appeared mid-session, after a member had been using the app.**
   `OnboardingGate` checked the org-wide config phase before the member's own
   `onboarding_completed_at`, so `entryGate.onboardingCompleted` never protected
   anyone once `phase === "config"`. That phase came from `setupStatus.isComplete`,
   a live, org-wide value that `computeOrganizationSetupStatus` makes fragile: it
   requires every active focus area to sit in a scheduled department, every active
   shift category to have a focus area, and every visible job to be placed with
   in-scope shift ids. An admin adding a focus area, shift, or job in Settings
   flipped it false for the whole organization until they finished placing it.
   `useOrgRealtimeInvalidation` pushes that change to every open tab, and
   `useOrganizationData`'s `loading` is `bootstrapQuery.isLoading` only, so a
   background refetch resolved with `loading === false` and the gate instantly
   replaced the page a member was working in with the wizard (setup-capable
   users) or the "Setup in Progress" screen (everyone else).

2. **A promoted member got the user flow, then the admin flow at random.**
   `OnboardingWizard` froze `isOrgSetup` at mount but recomputed `steps` from the
   live `role` prop. `usePermissions` re-resolves on the
   `organization_memberships` UPDATE event, which is exactly what a promotion
   fires, so a user part-way through the 2-step user flow was switched into the
   admin or super-admin flow under them. The persisted step index
   (`dg_onboarding:{user}:{org}`) was shared across variants, so the position
   carried into the new flow. Underneath that, `/api/account/permissions` derived
   the role from the JWT `org_role` claim and only re-read the database in the
   `admin` branch: `change_user_role` writes the membership row immediately but
   cannot re-mint an already-issued access token, so a freshly promoted member
   could read as `user` for up to a refresh interval, then flip.

## The fix

Answer the durable, per-member `onboarding_completed_at` before the org-wide
setup phase, latch the decision once the real app has been shown off settled
data, freeze the wizard variant at mount, and resolve the role from the database
rather than the token.

## Build steps

- [x] Extract the gate's decision ordering into a pure
      `components/onboarding/onboarding-decision.ts`, with two ordering changes:
      `entryGate.onboardingCompleted` is answered before the org-wide setup
      phase, and a new `appAlreadyShown` latch short-circuits to the app. The
      latch sits after the billing-lock check so an expiring trial still
      redirects. `OnboardingGate` now calls the resolver and renders its verdict;
      the latch is a ref set in an effect, not during render, so only a committed
      render that actually showed the app can set it (same reasoning as the
      existing M-5 note), and `freezeOnboardingPhase` moved from a render-time
      sessionStorage write into an effect.
      Done when a member who has completed onboarding is never returned to a
      wizard or the pending screen because org config is mid-edit, and a
      completeness flip arriving mid-session cannot replace the page in front of
      them. Proven by `onboarding-decision.test.ts` (11 cases) and four new
      `SetupLockGate.test.tsx` cases, including a rerender-driven mid-session
      flip.

- [x] Freeze `role` at mount in `OnboardingWizard` alongside `isOrgSetup`, name
      each flow (`user`, `admin`, `sa-config`, `sa-orientation`), and key the
      persisted step index by variant in `useOnboardingState`.
      Done when a promotion arriving mid-wizard cannot change which flow the
      member is in, and a position saved in one flow is never resumed in another.

- [x] Resolve `org_role` from the membership row for the effective org in
      `/api/account/permissions` for every claim carrying an org id, not just the
      `admin` branch. A missing row fails closed to `user` instead of falling
      through to the `profiles.org_id` path, `mfaNagRequired` follows the
      resolved role, and the `super_admin` claim keeps its no-lookup fast path
      (the sandbox contract an existing test asserts). Gridmaster and
      impersonation are untouched.
      Done when a promotion is visible to the client immediately rather than at
      the next token refresh. Proven by three new `route.test.ts` cases:
      stale-claim promotion, promoted-but-inactive stays read-only, and a
      vanished membership failing closed without consulting `profiles`.

- [x] Release `AppShell`'s header setup lock on the same condition the gate now
      uses. Required by step 1: without it an onboarded member in a mid-edit org
      got the app back but with no navigation.
      Done when a member the gate lets through keeps their header.

## Verify

- `rtk npm run type-check`
- `rtk npm run test:web` (352 files, 2877 tests)
- `rtk npm run lint` (0 errors)
- `rtk npm run build`
- Focused: `onboarding-decision.test.ts`, `SetupLockGate.test.tsx`,
  `useOnboardingState.test.tsx`, `account/permissions/route.test.ts`

## Not verified in a browser

`uiEvidence` is `when-available`, and no browser pass was run for this fix. The
symptoms are timing-dependent, so the useful manual path is: sign in as
`qa-super-admin@dubgrid.test`, open `/schedule`, then in a second tab add an
unplaced focus area in Settings. Before this fix the first tab flipped to the
wizard or "Setup in Progress"; it should now stay put, header included.

## Out of scope

`change_user_role` still does not force the target's token to re-mint, so the
JWT `org_role` claim itself stays stale until the next refresh. This fix
resolves the client's role from the database instead, but any server-side reader
that trusts `claims.org_role` directly has the same lag and would need its own
fix.

## Note

Built in a shared working tree. A concurrent session held uncommitted changes to
`ProfilePanel.tsx`, `ProfilePanel.test.tsx`, and `ProfilePage.tsx` throughout,
so this fix was committed by explicit path rather than staging the whole tree,
and those files are not part of its commit.
