# Feature: Fix staff pages double load

**From build-plan:** feature 26
**Status:** verified

## Goal

The build plan says the People page loads its data twice on entry, wasting
a round trip and causing a visible re-render, and asks for the duplicate
trigger to be found and removed without changing the page's data or
behavior.

Measured before changing anything, on a hard navigation to `/people` as
`qa-super-admin`, first against the dev server and then against a real
production build (`NEXT_DIST_DIR=.next-measure`, `next start -p 3100`),
because the App Router runs React StrictMode in development and its
double-invoked effects fake exactly this symptom:

| Request                              | dev | prod  | verdict                           |
| ------------------------------------ | --- | ----- | --------------------------------- |
| `GET /api/organization/bootstrap`    | 3   | **2** | real duplicate                    |
| `GET /api/account/identity`          | 2   | 1     | StrictMode artifact, not a defect |
| `GET /api/organizations/invitations` | 2   | 1     | StrictMode artifact, not a defect |
| everything else                      | 1   | 1     | clean                             |

A soft navigation from `/schedule` was clean in both modes. So the single
real defect was the bootstrap double-fetch on hard loads, and it is not
People-specific: it happens on every authenticated route.

**Root cause.** `OnboardingGate` returned a bare `<>{children}</>` while
`authLoading || perms.isLoading`, then switched to
`<Suspense><OnboardingCheckWithSection>{children}</…></Suspense>` once
permissions resolved. The children therefore moved to a different position
in the element tree, so React unmounted and remounted the entire page
subtree at that moment. That dropped the last observer of the
`["org","bootstrap"]` query; because `getOrganizationBootstrapQueryPolicy`'s
`queryFn` consumes the abort signal, react-query cancelled the in-flight
request and the remounted observer started a fresh one.

Confirmed directly rather than inferred: both fetches originate in
react-query's `onSubscribe`, 72 ms apart, and the first request ends in
`net::ERR_ABORTED` at the exact moment the second is issued.

This one trigger explains both halves of the build-plan item: the wasted
round trip and the "visible re-render".

## The fix

`OnboardingGate` now renders every non-public route through one stable tree
position. Public routes still short-circuit (`isPublicRoute` is constant
for a given pathname, so it cannot swap structure mid-render), and the
post-login splash still replaces content on purpose. Everything else -
still loading, signed out, gridmaster, no org, impersonating - passes
through `OnboardingCheck` with a new `gated={false}` prop instead of
bypassing it:

- `useOrganizationData({ enabled: gated })`, so a non-member still issues
  no requests (the previous behavior, where the component was not mounted
  at all).
- The onboarding decision is forced to a settled `app` pass-through when
  `gated` is false, so no wizard, billing redirect, or phase freeze can be
  computed from the placeholder ids.

## Build steps

- [x] **Step 1 - Measure in production mode.** (Done; table above. dev-only
      duplicates identified as StrictMode artifacts, which is why no
      product change was made for `identity` or `invitations`.)
- [x] **Step 2 - Pin the fix with a test.** Replaced the planned
      request-counting e2e with a unit test, deliberately: the e2e would
      run against the dev server, where StrictMode still doubles the
      counts, so it could not assert the production contract. The new
      `OnboardingGate subtree stability` case in `SetupLockGate.test.tsx`
      asserts the child subtree mounts exactly once across the
      loading -> resolved transition, which is the defect itself rather
      than a proxy for it. Verified to fail on the old code
      ("expected 2 to be 1") and pass on the new.
- [x] **Step 3 - Move the invitations fetch onto react-query.** Not done,
      on purpose. Production mode proved the second invitations request was
      a StrictMode artifact, so this would have been an unforced refactor
      of invitation state with no measured win, against the item's "without
      changing the page's data or behavior". Recorded here as considered
      and declined; the caching upside (sharing
      `queryKeys.org.invitations(orgId)` with the dashboard) remains
      available as its own item if wanted.
- [x] **Step 4 - Remove the surviving duplicate.** The `OnboardingGate`
      restructure above. Re-measured in production mode afterwards: every
      request on a hard `/people` entry is now exactly 1x, bootstrap
      included.
- [x] **Step 5 - Regression pass.** `SetupLockGate.test.tsx` 27/27,
      `tsc --noEmit` clean, eslint clean, and the authenticated e2e specs
      that cross this gate (`login`, `people`, `people-states`,
      `dashboard-states`, `role-variance`, `role-variance-admin`,
      `auth-release-qualification`) green on chromium.

## Files / areas

- `apps/web/src/components/onboarding/OnboardingGate.tsx` - the fix
- `apps/web/src/__tests__/SetupLockGate.test.tsx` - the regression test

## Notes

The measurement build and the throwaway probes were deleted; the dev
server's `.next` was never touched (`NEXT_DIST_DIR` isolation).
