# Feature: Admin and Gridmaster QA fixtures

**From build-plan:** feature 25d2a
**Status:** verified

## Goal

25d2 re-runs the 25d1 route-state matrix as Admin, User, and
Gridmaster-impersonation roles. Two of those roles have no safe automated
identity today:

- **Admin (org_role `admin`)** - `seed.ts`'s `TEST_USERS` has super-admins
  (`qa-super-admin`, the three `qa-mfa-*`), regular users (`qa-regular`,
  `qa-inactive`), and a management-access user (`qa-management`, still
  `org_role: "user"`). No entry has `org_role: "admin"`, even though the seed
  loop already handles it (`allAdminPermsObj` is applied when
  `user.org_role === "admin"`).
- **Gridmaster (platform_role `gridmaster`)** - the only gridmaster is
  `nicokosmas.dev@gmail.com` (`TEST_USERS[0]` and `supabase/seed_gridmaster.sql`),
  a personal dev-login account that scripted verification must never touch
  (19e's fixture rule, and this project's standing policy). The seed loop
  handles `platform_role: "gridmaster"` generically (profile with
  `org_id NULL`, excluded from memberships), so a QA gridmaster needs only a
  `TEST_USERS` entry, not more SQL.

Both fixtures are local/CI-only: `e2e.yml` seeds with `npx tsx seed.ts` under
`FORCE_LOCAL_DB=1`, so they exist wherever the e2e suite runs. Every
`TEST_USERS` account signs in with the shared local constant
`password123` (`QA_SUPER_ADMIN_PASSWORD` in `e2e/helpers/auth.ts`).

## In scope

- Two `TEST_USERS` entries in `seed.ts`: `qa-admin@dubgrid.test`
  (`org_role: "admin"`, Calm Haven, `management_access: true`, active) and
  `qa-gridmaster@dubgrid.test` (`platform_role: "gridmaster"`, no org
  membership, active).
- `e2e/helpers/auth.ts`: `QA_ADMIN_EMAIL`, `QA_GRIDMASTER_EMAIL`, and a
  `loginAsQaGridmaster` helper whose signed-in signal is the portal's, not
  the org shell's `Dashboard` link (a gridmaster has no org membership).
- A smoke spec proving each fixture lands where its role should, so 25d2b/c
  and 25d3 can rely on them.
- Whatever 19e's typed qualification matrix or its structural test requires
  when a fixture is added (they assert safe, enumerated fixtures).

## Out of scope

- The role-variance matrix itself (25d2b, 25d2c) and the portal's own view
  coverage (25d3). This feature only makes those runnable.
- Any change to `supabase/seed_gridmaster.sql` or the personal accounts in
  `TEST_USERS`.
- Remote or production seeding. `seed.ts` is local-only (`FORCE_LOCAL_DB`).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Add the two fixtures to `seed.ts`.** (Reseeded with the
      user's go-ahead. Gridmaster note for Step 2: the login route rejects a
      gridmaster on any org host; they sign in at
      `http://gridmaster.localhost:3000/login`, whose form is headed
      "Platform admin sign in" with an "Access Portal" submit, and land on
      `/dashboard` of that host, the portal, with a "Gridmaster" header and an
      "All Users" nav item. A fresh fixture also passes the Terms interstitial
      first. Non-super-admin org users hit `/billing-required` until a
      super admin's first login starts the org's trial, so the smoke spec must
      log in as `qa-super-admin` before `qa-admin` on a fresh database.) Append `qa-admin` and
      `qa-gridmaster` to `TEST_USERS` following the existing entries' shape
      and labelling (`"... (release qualification)"`). Then reseed the local
      database (`FORCE_LOCAL_DB=1 npm run seed`) - this wipes and rebuilds all
      local data, so ask before running it. _Done when_ both accounts sign in
      with `password123` at `calmhaven.localhost` (admin) and the gridmaster's
      landing origin, checked in a browser.
- [x] **Step 2 - Add the e2e constants and gridmaster login helper.** Export
      `QA_ADMIN_EMAIL` and `QA_GRIDMASTER_EMAIL`; add `loginAsQaGridmaster`,
      reading `apps/web/src/app/api/auth/login/route.ts` (`isGridmaster`
      branch) for where a gridmaster is sent after sign-in and what stable
      element proves the portal is up. `qa-admin` uses the existing
      `loginAsQaAccount`. _Done when_ both helpers type-check and a
      throwaway run signs each account in.
- [x] **Step 2a - Fix the admin invitations 403 the fixture exposed.** The
      smoke spec's runtime-failure collector (which also records 403s)
      caught `GET /api/organizations/invitations` returning 403 for
      `qa-admin`: the route's `requirePrivilegedActor` allows only super
      admins and gridmasters, while `invitations/create` allows any admin
      with `canManageEmployees`, and both `DashboardView` and
      `MembersSection` request the list for every management-mode member.
      Decision: user chose to fix it here. Align the list (and the other
      handlers behind the same guard) with `canManageEmployees`, gate the
      dashboard's request on the same permission, extend the route test, and
      keep the collector strict. _Done when_ the route test covers an admin
      with `canManageEmployees` (200) and one without (403), and the admin
      smoke test passes with zero recorded failures.
- [x] **Step 3 - Add `e2e/role-fixtures.spec.ts`.** (Also hardened two
      shared helpers the run exposed: `waitForClientHydration` and the new
      gridmaster wait use `.first()` because a route transition can briefly
      mount two login roots (seen on Firefox), and `runtime-noise.ts` now
      treats WebKit's `403` console echo for the Vercel Speed Insights
      script as benign, matching its existing 404 rule; a probe confirmed
      `va.vercel-scripts.com/.../script.debug.js` is the only 403 source.
      `GridmasterLogin.tsx` gained the same `data-hydrated` marker OrgLogin
      has, wrapped around its card since `AuthCard`'s `Card` takes only
      children.) Two tests: `qa-admin`
      lands in the Calm Haven shell with the `Settings` nav link visible
      (admin + `canAccessSettings`); `qa-gridmaster` lands on the portal and
      `/gridmaster` renders (the same route the manifest currently evidences
      only as a redirect for non-gridmasters). Use
      `collectUnexpectedRuntimeFailures` like
      `auth-release-qualification.spec.ts`. _Done when_ both pass 3 runs in
      a row across the configured browser projects.
- [x] **Step 4 - Keep 19e's matrix honest.** Find 19e's typed matrix and
      structural test (grep `safe fixture` / `TEST_USERS` under
      `apps/web/src` and `e2e`), add the two identities wherever fixtures are
      enumerated, and run that test. _Done when_ the structural test passes
      with the new fixtures listed and `npm run test:web` stays green.

## Files / areas

- `seed.ts` (root)
- `e2e/helpers/auth.ts`
- New: `e2e/role-fixtures.spec.ts`
- Whichever file holds 19e's qualification matrix (found in Step 4)
- Read-only: `apps/web/src/app/api/auth/login/route.ts`,
  `.github/workflows/e2e.yml`

## Data / contracts

Seed data only; no schema, API, or product code changes. The two emails and
the shared local password become fixtures later features depend on, so treat
them as load-bearing constants once landed (`qa-admin@dubgrid.test`,
`qa-gridmaster@dubgrid.test`).

## Testing

- Step 3's smoke spec is this feature's automated evidence; run it 3 times
  consecutively.
- Step 4's structural test must pass; run `npm run test:web` afterwards.
- Reseeding is the one destructive local action here; it needs the user's
  go-ahead in chat before it runs.

## Notes for the AI

- Never use `nicokosmas.dev@gmail.com`, `nicokosmas@outlook.com`, or
  `nicodamusalois@gmail.com` for anything, including as a template to copy
  passwords from. The QA password is the existing local constant.
- The gridmaster helper must not assert the org `Dashboard` link: a
  gridmaster profile has `org_id NULL` and no membership.
- Keep both new `TEST_USERS` entries minimal and shaped exactly like their
  neighbours; the seed loop derives everything else (permissions, membership,
  employee row) from `org_role`, `management_access`, and `employee_status`.
