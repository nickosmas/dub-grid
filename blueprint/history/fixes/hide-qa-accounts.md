# Fix: QA accounts are never shown to client organizations

**Type:** Fix
**Status:** verified

### The problem

DubGrid has no idea of a QA or internal account. `seed.ts` adds every
`@dubgrid.test` QA account (`qa-super-admin`, `qa-admin`, `qa-regular`,
`qa-management`, `qa-inactive`, the three `qa-mfa-*`, `qa-gridmaster`,
`marketing-demo`) to all 7 organizations, including Arden Wood, a real client.
Each one gets a membership and a staff row. A client therefore sees them as
real staff:

- **People and directory:** `/api/employees/manage` `fetchEmployees` (feeds
  Schedule, Dashboard, People, AppShell), `get_org_directory`, and
  `/api/organizations/users`.
- **Mobile:** the `packages/data-access/src/mobile.ts` listers (people,
  management roster, membership and profile names), plus the direct reads in
  `routes/people.ts` and `routes/shift-swap-options.ts` (the swap-partner
  pool).
- **Counts and outputs:** `/api/organization/employee-count`, the
  Settings dependency counts, the operations report's active and archived
  staff, and `/api/export`.
- **Billing:** `countBillableSeats` (`features/billing/seats.ts`) bills them as
  seats.

Most of these reads use the service client, so RLS alone would not hide them.
Gridmaster's organization page calls the same endpoints, so the rule has to
depend on who is looking.

### The fix

Mark internal accounts explicitly and filter on the viewer:

- **The flag.** Migration `081` adds `profiles.is_internal boolean NOT NULL
DEFAULT false`. Only a Gridmaster can change it: a trigger refuses any other
  caller, the person's own profile updates included. The migration sets it for
  existing `@dubgrid.test` accounts, so production is covered with no manual
  step. After that the flag is the only rule. Nothing reads the email domain.
- **Who sees them.** A Gridmaster or another internal account sees internal
  people. Everyone else never does. Internal accounts must see each other or
  the QA and Playwright suites lose their own fixtures. In SQL that is
  `caller_sees_internal()`. In TypeScript it is one shared viewer rule in a
  `packages/*` module, used by web and mobile.
- **Database.** Restrictive SELECT policies on `employees`,
  `organization_memberships` and `profiles` hide internal rows from a caller
  who cannot see them. This also keeps them out of Realtime payloads.
  `get_org_directory` and `get_org_users` apply the same rule. This follows
  the existing `platform_role <> 'gridmaster'` exclusion in `get_org_users`.
- **Service-client reads.** Each org-facing read listed above drops internal
  people unless the viewer can see them. They are found by the staff row's
  linked `user_id` or the membership's `user_id`.
- **Seats.** Internal people are never billable, whoever is looking.
- **Gridmaster.** The person page shows the flag and lets a Gridmaster turn it
  on or off. That needs fresh proof, like the other Gridmaster grants, and
  writes an audit row.

Must not break:

- **Gridmaster views:** the organization Users and Employees tabs,
  impersonation, staff search and person records still list internal people.
- **Uniqueness checks:** contact-uniqueness checks
  (`contact-conflicts.ts`, `api/users/check-email`) still see internal
  people, so a client cannot claim a QA address.
- **Sandbox:** every read stays scoped to the effective, sandbox-aware
  `orgId`.
- **Live-DB fixtures:** the fixtures that sign in as QA accounts still find
  themselves.

Out of scope, left unchanged on purpose:

- Notification fan-out to internal managers.
- Audit and activity entries written by an internal account. Their names
  still resolve.

### Build steps

- [x] **1. Migration 081: the flag, its guard, and the database filter.**
      Column, backfill, Gridmaster-only change trigger,
      `hidden_internal_user_ids()` and `caller_sees_internal()`, restrictive SELECT policies, and updated
      `get_org_directory` / `get_org_users`. Lock the checksum.
      **Done when:** a live integration test shows a client member cannot read
      an internal person's staff row, membership or profile, or see them in
      either RPC. A Gridmaster and an internal account can. A non-Gridmaster
      cannot set the flag. `npm run db:migrations:check` passes, and a query
      lists any schedule entries already assigned to internal staff.
      _Result (local, 2026-10-19):_ seed gives every QA account and
      `marketing-demo` 10 to 28 shifts in all 7 organizations, Arden Wood
      included, so the owner chose to hide those shifts too (step 4).
- [x] **2. Web org surfaces hide internal people.** The shared viewer rule,
      then `fetchEmployees`, the organization directory, organization users,
      employee count, Settings
      dependency counts, operations report, and export.
      **Done when:** route tests show internal people left out for a client
      viewer and kept for a Gridmaster and an internal viewer.
- [x] **3. Mobile hides internal people.** The `mobile.ts` listers, the people
      route, and the swap-partner pool.
      **Done when:** handler tests show the same split, and a client cannot
      pick an internal person as a swap partner.
- [x] **4. Internal staff's shifts are hidden from clients.** The same
      viewer rule applies to schedule cells and everything built on them:
      the web schedule grid, coverage and the dashboard, and the mobile
      schedule, open-shift and coverage reads.
      **Done when:** tests show a client's schedule and coverage figures
      leave out an internal person's shifts, and a Gridmaster and an internal
      viewer still see them.
- [x] **5. Internal people leave no trace in requests or history.** Shift
      requests (web and mobile lists, and called-off open shifts), publish
      history and the dashboard's recent changes, live draft broadcasts
      between editors, and the one-person shift lookup leave internal people
      out for a client.
      **Done when:** tests show a client never sees an internal person's
      request, published change, broadcast draft cell or shifts by id, and a
      Gridmaster and an internal viewer still do.
- [x] **6. Internal people are never billed.** `countBillableSeats` leaves
      them out.
      **Done when:** a seats test shows an internal active staff member and an
      internal member without a staff row both count zero.
- [x] **7. Seed and the Gridmaster control.** `seed.ts` sets the flag on every
      QA and marketing account. The Gridmaster person page shows it and
      toggles it behind fresh proof with an audit row.
      **Done when:** a route test covers the toggle (stale proof refused,
      audit row written), and after `npm run seed` Arden Wood's People page,
      seen by a client super admin, lists no QA account.

### Verify

- The step tests above, then `npm run type-check`, `npm run lint`,
  `npm run test`, `npm run build` and `npm run docs:check` from the worktree.
- Manually: sign in as a client Arden Wood super admin (not a QA account).
  People, Schedule rows, the swap partner list on mobile, the employee count,
  and the billing seat figure show no `QA ...` person or Jane Morgan. Sign in
  as `qa-gridmaster@dubgrid.test`. The Arden Wood organization page still
  lists them, flagged.
