# Fix: Staff records are written by the server only

**Type:** Fix
**Status:** verified
**Fixes:** F-100

## The problem

`admin_update_employees` and `admin_delete_employees` (`003_rls_policies.sql`)
let any Admin with `canManageEmployees` write any staff record in their
organization, and the 004 table grant gives `authenticated` INSERT, UPDATE and
DELETE on `employees`. `POST /api/employees/status` refuses an Admin acting on
an Admin, Super Admin or Gridmaster or on their own record, but the data API
does not. Reproduced on the local stack in a rolled-back transaction: an
Admin's claims set a Super Admin's linked staff row to `removed` (1 row), and
the access-token hook then refuses that Super Admin's sign-in and refresh.
Gridmaster tokens are already held to fresh proof by 054.

## The fix

Mirror 052 (memberships) and 049 (invitations): revoke INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES and TRIGGER on `public.employees` from `authenticated` in
a forward migration, `065_employees_written_by_server_only.sql`. Reading is
unchanged (036's column grants and the SELECT policies stay).

Why a revoke and not a trigger: no application path writes `employees` with a
signed-in user's token. Every route and server helper writes through the
service role (`employees/manage`, `employees/identity`, `employees/status`,
`account/server/profile.ts`, `profile-change-requests.ts`, the mobile people
and invitation routes, `data-access`), every SQL function that writes it is
SECURITY DEFINER (`accept_invitation`, `gdpr_erase_user_data`,
`remove_focus_area_from_employees`, `sync_employee_email_from_auth`,
`terminate_user_account`, `update_mobile_employee_with_audit`), the mobile app
writes none, and the browser's staff actions call those routes. The browser-
client writers left in `lib/db/employees.ts` are imported only by a unit test;
after the revoke they could only fail, so they go.

Must not break: every staff create, edit, identity, status, import, profile,
invitation and mobile path (service role, unaffected); the per-organization
isolation guarantees (a cross-tenant write is now refused outright rather than
matching no rows).

## Build steps

- [x] **Step 1 - revoke the member write grant** - migration 065 with its
      checksum; the live cross-tenant test in `org-isolation.integration.test.ts`
      expects the write refused (42501) instead of zero rows; a live test that
      the Admin claims from the reproduction cannot set a Super Admin's staff row
      to `removed` and that the row is unchanged; any grant-inventory test
      updated. _Done when:_ 065 applied locally, `npm run db:migrations:check`
      passes, the new and changed live tests pass, and the reproduction returns
      a permission error. _Done 2026-09-28:_ the new Admin test failed before
      065 (the write went through) and passes after; 065 applied to the local
      stack; the readiness check passes; the whole live suite passes (29 files,
      134 tests); the reproduction now answers "permission denied for table
      employees" and the row stays `active`. No grant-inventory test named
      `employees` writes.
- [x] **Step 2 - drop the dead browser-client staff writers** - remove the
      four `lib/db/employees.ts` functions that write `employees` with the
      browser client (`insertEmployee`, `updateEmployee`,
      `updateEmployeeIdentity`, `updateEmployeeDepartments`, and their private
      `syncLinkedProfileName`); no application code imports them (callers use
      `features/employees/client`, which calls the routes), and after 065 they
      could only fail. Drop `employee-name-sync.test.ts`, which tested only them.
      The route-backed functions in the same file are unaffected and stay.
      _Done when:_ no browser code can issue a direct staff write, and
      `npm run type-check`, `npm run test:web`, `npm run test:mobile` and
      `npm run lint` pass. _Done 2026-09-28:_ 167 lines removed; no browser
      code writes `employees`; type-check, lint (0 errors), `test:web` (5175
      tests) and `test:mobile` (1406) pass.

## Release order

The revoke only removes a privilege no application code uses, so 065 can go to
production ahead of the code, after the scratch rehearsal from 064, once the
deployed release is confirmed to make no user-client write to `employees` (the
same search at the release commit).

## Verify

- Live: the new test and the rolled-back reproduction get a permission error.
- Manual (optional): as an Admin, edit, deactivate, reactivate and remove a
  staff member on the People page; each works as before.

## Findings

### employees-written-by-server-only/F-100 [P1] closed - An Admin can remove or edit a Super Admin's staff record through the data API

**File:** `supabase/migrations/003_rls_policies.sql:277` (`admin_update_employees`, and `admin_delete_employees` at :282); `supabase/migrations/004_grants.sql` (UPDATE and DELETE on `employees` to `authenticated`); `supabase/migrations/002_functions_triggers.sql:279` (the hook refuses a `removed` employee)
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96's staff status gate
**Why it matters:** `POST /api/employees/status` refuses an Admin acting on an Admin, Super Admin or Gridmaster and on their own record, but the table itself only asks for `canManageEmployees` in the caller's organization. Reproduced on the local stack inside a rolled-back transaction: an Admin's claims (`canManageEmployees` on, no MFA) ran `UPDATE public.employees SET status = 'removed'` on the Super Admin's linked row and it applied (1 row); the access-token hook then refuses that Super Admin's sign-in and refresh. The same policies let an Admin rewrite or delete any staff record the route's guards protect. No privilege is gained, but a lower tier can lock out a higher one, against the tier rule. Predates item 43. Gridmaster tokens are covered by 054's fresh-proof policies.
**Suggested fix:** A forward migration. Either (a) revoke INSERT, UPDATE and DELETE on `public.employees` from `authenticated`, as 052 did for memberships, after moving the user-client writes (check which client `lib/db/employees.ts`, `features/account/server/profile.ts` and `profile-change-requests.ts` pass) onto the service role behind their routes; or (b) a `BEFORE UPDATE OR DELETE` trigger that, for a non-service caller below Super Admin, refuses a row linked to an Admin, Super Admin or Gridmaster and a change to the caller's own `status`, mirroring the route. Add a live test that the Admin claims above get zero rows.
**Resolution:** Fixed in `fix/employees-written-by-server-only`: migration `065_employees_written_by_server_only.sql` revokes INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on `employees` from `authenticated` (every application write already went through the service role or a SECURITY DEFINER function), and the four dead browser-client writers in `lib/db/employees.ts` are removed. A live test gives an Admin with `canManageEmployees` a permission error for update and delete of a Super Admin's staff record (it failed before 065), a Super Admin the same, and the service role still writes; the cross-tenant isolation test now expects the refusal. Applied to the local stack; production needs 065 by the runbook. Re-review (2026-09-28, independent `/audit` of the branch): closed. With 065 applied locally, `employees`' table ACL gives `authenticated` no insert, update or delete, no column-level write grant exists (036 left SELECT only), `anon` is refused, no view depends on the table, and every function that writes it is SECURITY DEFINER; every application writer uses the service role; a rolled-back re-grant reproduced the old exploit and 065 refuses it. Follow-up hardening is F-109.
