# Feature: Admin and Gridmaster-impersonation variance

**From build-plan:** feature 25d2c
**Status:** verified

## Goal

25d2b pinned the two non-admin fixtures. This feature closes the 25d2 role
matrix with the two remaining identities from 25d2a: `qa-admin` (org role
`admin`, seeded with every admin permission via `allAdminPermsObj`) and
`qa-gridmaster` impersonating a Calm Haven member through the portal's
impersonation flow. Traced from the code, the expected contract is:

| Route          | `qa-admin` (admin, all 25 admin permissions, on schedule)                                                                                                                                                                                                                                                                           | `qa-gridmaster` impersonating `qa-regular`                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`   | `AdminDashboard` (`getDashboardRoleVariant`: level 2); "Overtime watch" card present                                                                                                                                                                                                                                                | `UserDashboard` ("Available shifts" / "Cover requests"), exactly as 25d2b's regular row                                                                                    |
| `/schedule`    | grid; any employee's cell opens the "Edit shift" dialog (`canEditShifts`)                                                                                                                                                                                                                                                           | own row opens the detail panel, another employee's cell opens nothing                                                                                                      |
| `/people`      | directory with the `Add` action (`canManageEmployees`); a row opens `StaffDetailPanel` (editable, its `Save` control present)                                                                                                                                                                                                       | read-only `StaffReadOnlyDetailPanel`, no `Add`/`Save`/`Deactivate`                                                                                                         |
| `/people/[id]` | `EditEmployeePanel` rendered (`canEditDetails`), so a `Save` control exists                                                                                                                                                                                                                                                         | read-only "Employment" field, no edit controls                                                                                                                             |
| `/profile`     | Overview section (on schedule)                                                                                                                                                                                                                                                                                                      | Overview section                                                                                                                                                           |
| `/reports`     | renders (`canViewReports` in `ADMIN_DEFAULT_PERMS`)                                                                                                                                                                                                                                                                                 | replaced with `/dashboard`                                                                                                                                                 |
| `/alerts`      | inbox                                                                                                                                                                                                                                                                                                                               | inbox                                                                                                                                                                      |
| `/settings`    | renders (`proxy.ts:668` admits level >= admin; `canAccessSettings` true via the view perms). Sections: Labels, focus areas, schedule definitions, coverage, indicators present; super-admin-only "Organization Details", "Subscription", "Activity Log", "Danger Zone", and `canManageOrgSettings`-only "Shift Display Mode" absent | `proxy.ts:668` redirects to `/schedule` (effective role `user` from the verified impersonation session)                                                                    |
| Header nav     | Dashboard, Schedule, People, Reports, Settings all visible                                                                                                                                                                                                                                                                          | Dashboard, Schedule, People; no Reports, no Settings; `ImpersonationBanner` "Impersonating qa-regular@dubgrid.test" with "End Session"; no sandbox or billing entry points |

Correction made during Step 5: impersonation is role-scoped, not
identity-scoped. `docs/authentication.md:416` and `proxy.ts:472-479` verify
the target's membership, organization and role, but the gridmaster's own
JWT keeps acting and it has no linked employee. So the impersonated column
above overstated the contract: `/dashboard` renders the `UserDashboard`
variant in its "No linked staff profile" state (greeting the gridmaster),
`/schedule` has no own row, and `/profile` has no Overview section. The
role-gated outcomes (nav, Reports and Settings redirects, read-only People,
no manage controls) hold as written. The banner reads "Impersonating
qa-regular@dubgrid.test" while the page greets "qa-gridmaster"; recorded as
an observation for Step 6.

Where impersonation runs: `setImpersonationCookie` writes a host-only
cookie and `handleStart` does `window.location.replace("/schedule")`, so
the impersonated session is served on the portal origin
(`gridmaster.localhost:3000`), with `proxy.ts:417-500` overriding
`org_id`/`org_slug`/`org_role` from the DB-verified session. Navigating to
`/gridmaster` while impersonating clears the cookie (the safety escape at
`proxy.ts:441`).

## In scope

- `e2e/helpers/role-variance.ts`: the walker, nav, no-manage-controls,
  scheduled-cell, warm-up and collector helpers lifted out of
  `e2e/role-variance.spec.ts` so both spec files share them; the walker
  takes an origin.
- `e2e/role-variance-admin.spec.ts`: `qa-admin` route entry contract and
  interaction variants.
- `e2e/role-variance-impersonation.spec.ts`: start impersonation through
  the portal UI, walk the impersonated contract, end it two ways.
- Closing any contract violation found, the way 25d2a did (a small
  in-scope fix with a test, or a recorded finding), decided with the user.

## Out of scope

- Mutations as either identity (saving a person, editing a shift, changing
  a role): the contract is what renders and what is reachable. Tier guards
  (admin cannot touch admin/super_admin rows) are unit-tested in
  `packages/authz` and `self-action` tests.
- Impersonating a super admin or using the role override; one target
  (`qa-regular`) proves the flow and the override is a display-only knob
  the proxy re-derives from the DB anyway.
- The portal's own views (25d3), impersonation history, notifications
  (`/api/notify-impersonation`), and session expiry (30 minutes).
- Bootstrap loading/recovery states: proven role-independent in 25d2b.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared helpers.** (Pure move, 6/6 on Chromium in 4.2m.) Move `collectUnexpectedRuntimeFailures`,
      `warmUpAndCaptureEmployeeHref`, `walkRoutes`, `expectNav`,
      `expectNoManageControls`, and `scheduledCell` from
      `e2e/role-variance.spec.ts` into `e2e/helpers/role-variance.ts`,
      giving `walkRoutes`/`expectNav` an `origin` parameter (default
      `QA_CALM_HAVEN_ORIGIN`). No behavior change. _Done when_
      `npx playwright test e2e/role-variance.spec.ts --project=chromium`
      is green (the 25d2b file already had 3 greens per browser; this is a
      pure move).
- [x] **Step 2 - `qa-admin` route entry contract.** (Matched the table on
      the first honest run, 3 consecutive greens across the browsers. The
      `/reports` marker is the "Generate report" button; Settings sections
      are addressed by `?section=<id>` and rendered as sidebar links named
      by label, so the super-admin-only sections are asserted absent by
      link name.) New
      `e2e/role-variance-admin.spec.ts`: warm-up, sign in as `qa-admin`,
      walk the eight routes per the table (markers: "Overtime watch",
      grid, `Add` button, `Save` button on `/people/<id>`, Overview,
      a `/reports` page marker read from `ReportsPageContent.tsx`, Inbox,
      and on `/settings` the "Labels" section present with "Organization
      Details", "Subscription", "Activity Log", "Danger Zone", "Shift
      Display Mode" absent), then the nav (all five visible). Read
      `settings/page.tsx` for how a section is addressed before choosing
      the settings markers. _Done when_ 3 green runs across the browsers.
- [x] **Step 3 - `qa-admin` interaction variants.** (Matched the contract;
      one test-side correction: the Labels section renders its fields with
      the org's plural terminology, so the fallback marker is the "Labels"
      heading. `/settings?section=org-billing` lands on Labels with no
      Subscription content. Observation, not a violation: Labels shows the
      "Some settings are read-only based on your permissions" notice for
      this all-permissions admin, since label editing is super-admin-only.)
      On `/people`, a roster
      row opens dialog "Staff detail" with a `Save` control present (no
      click on it); on `/schedule`, a cell in another employee's row opens
      dialog "Edit shift", Escape closes it; on `/settings`, a super-admin-
      only section addressed directly (however Step 2 found sections are
      addressed) does not render its content. _Done when_ 3 green runs.
- [x] **Step 4 - Start impersonation through the portal.** (Green 3x3.
      Test-side: the portal header has its own org chip and search, so the
      picker locators are scoped to the "Gridmaster content" region; and a
      leftover open session makes `start_impersonation` refuse, so the spec
      ends `qa-gridmaster`'s own open sessions through the API before
      starting and after finishing. Two product observations for Step 6,
      both in `api/gridmaster/impersonation/route.ts`: (a) `endSchema`
      accepts any `reason` string while the database constrains
      `end_reason` to `manual | expired | navigation`, so an unknown reason
      becomes a generic 500; (b) starting while another session is active
      surfaces the RPC's clear message as the same generic 500 and the
      confirm dialog stays open with no explanation.) New
      `e2e/role-variance-impersonation.spec.ts`: warm-up (Calm Haven trial
      active), `loginAsQaGridmaster`, open the "Impersonation" nav item,
      search organizations for "Calm", select Calm Haven, search users by
      "qa-regular", select the row, type a justification of at least 10
      characters, click "Impersonate qa-regular@dubgrid.test", confirm
      "Start impersonation", and assert the browser lands on
      `${QA_GRIDMASTER_ORIGIN}/schedule` with the banner "Impersonating
      qa-regular@dubgrid.test" and the `dubgrid-impersonation` cookie set.
      The collector must stay empty apart from nothing: a 403 or 5xx here
      is a defect. _Done when_ 3 green runs.
- [x] **Step 5 - Impersonated contract and ending the session.** (Green
      3x3 with Step 5b. Contract corrected to role-scoped impersonation,
      see above. The banner's End Session has no confirmation dialog (that
      dialog belongs to the portal's Impersonation view). Product findings
      recorded: F-71 banner-versus-greeting identity copy; F-72 the
      /gridmaster escape leaves the session row active; F-73 an
      intermittent Firefox bounce to /login after End Session, probed
      (client-initiated document GET of /login with the auth cookie intact,
      one console error object), emitter unconfirmed; the test asserts the
      session ended via the API and annotates the bounce instead of
      failing, per the user's decision.) Continue
      from Step 4's state: walk the impersonated column of the table on
      the portal origin (the 25d2b regular markers plus the banner on
      every route), assert the nav, then click "End Session", confirm
      "End session", and assert the portal renders (button "All Users"
      visible) with the cookie gone. In a second test, start impersonation
      again and instead navigate to `${QA_GRIDMASTER_ORIGIN}/gridmaster`;
      assert the safety escape: portal renders, no banner, cookie cleared.
      _Done when_ 3 green runs.
- [x] **Step 5b - Repair: `/api/account/self` 500 for a non-member.**
      (Both repairs verified: unit tests 16/16 across `profile.test.ts`,
      `ProfilePanel.test.tsx` and the route test; eslint, prettier and
      `tsc` clean; impersonation spec 3x3 green with the collector strict
      apart from the annotated F-73 bounce.)
      Found by Step 5: `fetchSelfWorkProfileSnapshot` throws when the
      caller has no membership in the requested org, which is every
      gridmaster impersonation session on `/profile`, and the route maps
      the throw to 500. Return the same empty work snapshot the no-org
      branch returns instead, with a focused unit test. Decided with the
      user: fix here. The strict collector then surfaced a second
      impersonation-only request, `/api/account/change-requests` answering
      403 for the non-member: also decided with the user to fix here, by
      adding `isOrgMember` to the self snapshot (server type, client type,
      `useSelfProfileData`, `ProfilePage`) and gating `ProfilePanel`'s
      change-requests fetch on it, with panel and loader unit tests. _Done
      when_ the unit tests pass and the impersonation spec is 3x green with
      the collector strict.
- [x] **Step 6 - Close what the matrix found.** (Two product defects
      repaired in Step 5b after decisions with the user; five findings
      recorded, F-69 to F-73, none blocking. The admin contract matched on
      the first honest run; the impersonation contract needed the
      role-scoped correction above, not a product change. Final evidence:
      `role-variance-impersonation.spec.ts` 9/9 in three consecutive runs,
      and a regression pass of `role-variance-admin.spec.ts` plus 25d2b's
      `role-variance.spec.ts` after the profile repairs, 24/24 in one run.)
      If any assertion fails for
      a product reason, stop and decide with the user (fix as an extra
      step, or record a finding); if nothing fails, record that explicitly
      in the archive. _Done when_ every step above is green and any
      violation has a recorded resolution.

## Files / areas

- New: `e2e/helpers/role-variance.ts`, `e2e/role-variance-admin.spec.ts`,
  `e2e/role-variance-impersonation.spec.ts`
- Modified: `e2e/role-variance.spec.ts` (imports the shared helpers)
- Read-only: `apps/web/src/components/gridmaster/EnhancedImpersonation.tsx`,
  `apps/web/src/components/ImpersonationBanner.tsx`,
  `apps/web/src/proxy.ts:417-500,668-690`,
  `apps/web/src/lib/impersonation.ts`,
  `apps/web/src/components/settings/nav-config.tsx`,
  `apps/web/src/app/(app)/settings/page.tsx`,
  `apps/web/src/components/dashboard/AdminDashboard.tsx`,
  `packages/authz/src/index.ts` (`ADMIN_DEFAULT_PERMS`, `canAccessSettings`)

## Data / contracts

None. The table is the contract. One open question the walk will answer
rather than the code: the client permissions come from the permissions
query, and the proxy only rewrites claims for page routes (`api` is
excluded from its matcher). If that query does not honor the impersonation
cookie, the impersonated shell would show `qa-gridmaster`'s own
permissions while the proxy gates routes as `user`; that would be a real
violation for Step 6, not a test misreading.

## Testing

- Each new test: 3 consecutive passing runs across Chromium, Firefox, and
  WebKit before its step is done.
- The collector (console errors, 403, 5xx) in every test. Impersonation
  start writes an audit row and posts `/api/notify-impersonation`; a
  failure there is a defect, not noise.
- Each impersonation test ends its session (End Session or the
  `/gridmaster` escape) so the `impersonation_sessions` table does not
  accumulate open sessions across runs; a test that fails mid-way leaves
  one open, which the next start handles (a new session is minted).
- `npm run test:web` unaffected unless Step 6 changes product code.

## Notes for the AI

- Gridmaster signs in on `gridmaster.localhost` only
  (`loginAsQaGridmaster`); org hosts reject it with 403
  `GRIDMASTER_PORTAL_REQUIRED`. The impersonated walk therefore uses
  `QA_GRIDMASTER_ORIGIN`, not the Calm Haven origin.
- The portal's desktop sidebar item is "Impersonation"; the mobile chip is
  "Impersonate". Use the desktop one.
- The banner's "End Session" button opens a `ConfirmDialog` titled "End
  Impersonation" with confirm label "End session".
- The admin fixture needs the trial started: reuse the super-admin warm-up
  from the shared helper before signing in as `qa-admin` (25d2a hit
  `/billing-required` without it).
- Assert on rendered text and roles; for "editable" assert a specific
  control exists (`Save`), never click it.
