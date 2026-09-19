# Feature: Regular and management user variance

**From build-plan:** feature 25d2b
**Status:** verified

## Goal

25d1 proved every core route's states as `qa-super-admin`. This feature
re-runs that matrix as the two non-admin fixtures that already exist and
pins each route's role-gated outcome, so a future change can't silently
give a regular user an admin control or lock a management user out of a
page they should see. Traced from the code, the expected contract is:

| Route          | `qa-regular` (user, on schedule)                                                                                                                               | `qa-management` (user + management access, also on schedule)                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/dashboard`   | renders the `UserDashboard` variant (`getDashboardRoleVariant` → `"user"`)                                                                                     | same `UserDashboard` variant                                                      |
| `/schedule`    | grid renders; a cell in the viewer's own row opens the request panel; another employee's cell does nothing (`openCellEditor`: no edit, no request, no details) | same                                                                              |
| `/people`      | directory renders (`canViewStaff`); row click opens `StaffReadOnlyDetailPanel` with no edit controls; no "Add" action                                          | same, plus the management roster (`canSeeManagementUsers` via `isManagementUser`) |
| `/people/[id]` | renders read-only (`userViewPermsObj.canViewEmployeeDetails: true`); no edit controls                                                                          | same                                                                              |
| `/profile`     | renders with the Overview section (on schedule)                                                                                                                | same                                                                              |
| `/reports`     | `router.replace("/dashboard")` + toast "Reports aren't included in your permissions." (`canViewReports` false for user role)                                   | same                                                                              |
| `/alerts`      | inbox renders                                                                                                                                                  | inbox renders                                                                     |
| `/settings`    | `proxy.ts:668` redirects to `/schedule` before the page renders                                                                                                | same                                                                              |

Header nav follows the same rules (`Header.tsx:285-297`): Reports and
Settings hidden for both; Dashboard shown because both are on the schedule.

Correction made during Step 2: the first draft of this table assumed
`qa-management` was management-_only_ (no scheduled focus area), which
`DashboardPageContent.tsx:26-33` bounces to `/schedule` and `Header.tsx:262`
hides Dashboard from. It isn't: `seed.ts`'s "Putting login accounts on the
schedule" step clones a donor's focus areas and cells onto every
login-linked employee with empty focus areas, the management fixture
included. The product followed its rule; the fixture's shape was misread.
There is currently no seeded management-only identity, so that variant
(Dashboard bounce, no Overview) remains unqualified; noted for 25d2c or a
fixture follow-up.

## In scope

- `e2e/role-variance.spec.ts`: one login per role, then the eight routes in
  sequence asserting the URL outcome and one role-appropriate marker each;
  a second test per role for the interaction variants (People drawer,
  Schedule cell click, People detail, Profile sections); and one test that
  re-runs the bootstrap loading and error states on `/people` for both
  roles (plus `/dashboard` for `qa-regular`), proving those states are
  role-independent.
- Closing any contract violation found, the way 25d1c2 and 25d2a did: a
  small in-scope fix with a test, or a recorded finding when the fix is
  larger than a step, decided with the user.

## Out of scope

- `qa-admin` and gridmaster impersonation (25d2c).
- Mutations as these roles (submitting a request, saving a profile): the
  contract here is what renders and what's reachable, not request flows
  already covered by feature 6/22 tests.
- Manifest changes: `typography-route-manifest.ts` tracks evidence per
  route, not per role; this feature's evidence lives in its spec file and
  the archive.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `qa-regular` route entry contract.** (Two shared-helper
      findings along the way, both browser noise rather than product
      behavior: WebKit's ProtectedRoute briefly hops toward `/login` while
      settling right after a server redirect, so the walker now waits for the
      signed-in nav before the next `goto`; Firefox logs the Supabase
      realtime websocket's teardown on navigation as a console error, now in
      `runtime-noise.ts`'s benign list. Every route's outcome matched the
      contract table on the first honest run.) New
      `e2e/role-variance.spec.ts` with a shared `ROUTE_CONTRACT` table and a
      test that signs in once as `qa-regular` (after the super-admin
      trial-start warm-up `role-fixtures.spec.ts` uses) and visits each route,
      asserting the table's URL and marker, plus the nav's visible items
      (Dashboard, Schedule, People; no Reports, no Settings). Read
      `UserDashboard.tsx` for its distinctive card titles ("Available shifts",
      "Cover requests") and `Header.tsx` for nav names. _Done when_ the test
      passes 3 runs in a row across the browser projects.
- [x] **Step 2 - `qa-management` route entry contract.** (The first draft
      of this step assumed a management-only fixture; see the correction
      above. The product matched the corrected table on the first run. The
      `/people` marker is the roster switcher's trigger, "On Schedule (N)",
      because the "Management (N)" label is a `CustomSelect` option that
      only exists in the DOM while the listbox is open.) Same test shape for
      `qa-management`: `/dashboard` renders `UserDashboard`, `/reports` ends
      on `/dashboard`, `/settings` on `/schedule`, Dashboard/Schedule/People
      nav visible, Reports/Settings hidden, People offers the management
      roster. _Done when_ 3 green runs.
- [x] **Step 3 - `qa-regular` interaction variants.** (Every outcome matched
      the contract. One observation for Step 6: the viewer's own-shift
      panel is `ShiftEditPanel` in detail mode, which keeps
      `aria-label="Edit shift"` even when `allowShiftEdits` is false, so a
      screen reader announces a read-only panel as an editor; the test
      matches on rendered content instead. The grid's hover tooltip is also
      `role="dialog"`, so the "nothing opens" assertion counts modal
      dialogs only.) On `/people`, click a
      roster row and assert the read-only panel (its close button) with no
      "Deactivate"/"Save" controls and no "Add" action on the page; on
      `/schedule`, click a cell in the "QA Regular" row and assert a request
      panel opens, then click another employee's cell and assert no panel;
      on `/people/<a seeded employee id>`, assert the read-only page (no edit
      controls); on `/profile`, assert the Overview nav item exists. _Done
      when_ 3 green runs.
- [x] **Step 4 - `qa-management` interaction variants.** (Matched the
      corrected contract on the first run, no product findings.) On `/people`, the
      read-only drawer opens from both the on-schedule roster and the
      management roster (switch the roster `CustomSelect` to "Management";
      an on-schedule member opens `StaffReadOnlyDetailPanel`, a
      management-only person or pending invite opens
      `ManagementStaffPanel`), with no manage controls on either; the
      schedule, `/people/<id>` and `/profile` outcomes match Step 3 because
      this fixture is also on the schedule (see the correction above).
      _Done when_ 3 green runs.
- [x] **Step 5 - Role-independent states.** (Both roles reach the same
      "Loading your workspace" / "Try again" recovery screen the super-admin
      specs assert. Three test-side hardenings, none a product defect: the
      page fires the bootstrap more than once on load, so a delayed copy
      the next `goto` aborts must not throw from the route handler; WebKit
      echoes those aborts as "The Internet connection appears to be offline"
      console errors, filtered with the injected 503; and `OnboardingGate`
      paints `AuthTransitionScreen` instead of the page's progress bar while
      the post-login `dg_auth_transition` flag is still set, so the helper
      polls that key to null before injecting delays. One product
      observation for Step 6: while the bootstrap is retrying a 5xx the
      shell renders nothing at all for up to ~7s before the recovery screen,
      the same for every role.) For both roles, delay and fail
      `/api/organization/bootstrap` on `/people` and assert the progress bar
      then the recovery screen exactly as `people-states.spec.ts` does; for
      `qa-regular` do the same on `/dashboard`. _Done when_ 3 green runs and
      the recovery screen is byte-for-byte the same copy the super-admin
      tests assert.
- [x] **Step 6 - Close what the matrix found.** (No contract violation:
      every assertion that failed along the way was a test misreading or
      browser noise, and both fixtures matched the corrected table. Two
      role-independent observations recorded as P3 findings in
      `findings.md`: F-67, the read-only shift detail panel keeps
      `aria-label="Edit shift"`; F-68, the shell renders nothing while the
      bootstrap retries a 5xx. Neither blocks completion. Final evidence: the
      whole file, 6 tests across Chromium, Firefox and WebKit, 18/18 in one
      run after every test had 3 consecutive greens.) If any step's assertion
      fails for a product reason, stop and decide with the user (fix as an
      extra step, or record a finding for 25d2c); if nothing fails, record
      that explicitly in the archive. _Done when_ every step above is green
      and any violation has a recorded resolution.

## Files / areas

- New: `e2e/role-variance.spec.ts`
- Read-only: `apps/web/src/components/dashboard/UserDashboard.tsx`,
  `apps/web/src/components/Header.tsx`,
  `apps/web/src/components/staff/MembersSection.tsx`,
  `apps/web/src/components/staff/StaffReadOnlyDetailPanel.tsx`,
  `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` (`openCellEditor`),
  `apps/web/src/proxy.ts`

## Data / contracts

None. The table above is the contract; a mismatch is either a test
misreading (fix the test) or a product defect (Step 6 decides).

## Testing

- Each new test: 3 consecutive passing runs across Chromium, Firefox, and
  WebKit before its step is done.
- Use `collectUnexpectedRuntimeFailures` from `role-fixtures.spec.ts` (with
  403 paths recorded) in every test: a role hitting an endpoint it isn't
  allowed to use is a violation even when the page looks right.
- `npm run test:web` unaffected unless Step 6 changes product code.

## Notes for the AI

- One login per role per test; visit routes with `page.goto` and wait for
  the URL outcome with a regex, since `/reports` and `/dashboard` chain two
  client redirects for the management user.
- Both fixtures need Calm Haven's trial active: reuse the super-admin
  warm-up + `clearCookies` + `about:blank` pattern from
  `role-fixtures.spec.ts`.
- Assert on rendered text and roles, not implementation details; for
  "no edit controls" assert specific buttons are absent (`Deactivate`,
  `Save`, `Add`) rather than counting inputs.
- Don't create, edit, or delete data as these roles; the contract is
  visibility and reachability.
