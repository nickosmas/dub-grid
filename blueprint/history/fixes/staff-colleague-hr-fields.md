# Fix: colleagues' employee number and employment type stay with staff managers

**Status:** complete

## Problem

A regular member's view of a colleague still carried two HR facts the UI
never showed them: the directory route sent every colleague's
`employeeNumber`, the employees route's view-only mask
(`maskEmployeeForViewer`) kept `employeeNumber` and `employmentType`, and the
mobile colleague allow-list (`toColleagueMobilePerson`) kept both "to match
web".

Owner decision (2026-11-14): regular members do not see a colleague's employee
number or employment type. Staff managers do, behind the gate each route
already uses for other HR facts (`canViewEmployeeDetails`, which authz derives
from `canManageEmployees`, plus Super Admin and Gridmaster). Seniority stays
because the roster order depends on it.

## Fix

- `GET /api/organization/directory`: `employeeNumber` is null on a colleague's
  row unless the caller sees staff status (the contact-details gate or
  `canManageEmployees`). Your own row keeps it.
- `POST /api/employees/manage`: `maskEmployeeForViewer` leaves
  `employeeNumber` and `employmentType` out of a colleague's row
  (`fetchEmployees`, `fetchEmployeeById`, `fetchEmployeeByUserId`). Your own
  row keeps both.
- `toColleagueMobilePerson` no longer names either field, so
  `/api/mobile/people` and `/api/mobile/people/[id]` leave them out for a
  regular member.
- Contracts: `mobilePersonSchema.employeeNumber` and `.employmentType` are
  optional with no default, so the app never invents "Full-time" for a
  colleague. The domain `Employee.employmentType` is optional for the same
  reason. Server types fed from database rows (`MobilePeopleRow`,
  `MobilePersonSource`, `LoadedMobilePerson`) keep both required.
- Renderers cope with a missing value: the staff page header, your profile
  summary, the read-only staff panel, the staff table's ID and Employment
  cells, the full and part-time counts, the employment filters on web and
  mobile, and the mobile person page's Employee ID and Employment rows show
  nothing (or "-") instead of "Full-time" or "#undefined".
- No self view reads the colleague payload: your web profile reads your own
  row and the mobile profile has its own route, both unchanged.

## Evidence

- `organization/directory/route.test.ts`: a regular member gets no
  colleague's number but keeps seniority and their own number; a staff
  manager gets every number.
- `employees/manage/route.test.ts`: `fetchEmployeeById` and `fetchEmployees`
  leave both fields out of a colleague's row for a view-only caller, keep
  their own, and give a staff manager both.
- `mobile-api-core/src/read.test.ts` and `mobile/server/routes/person.test.ts`:
  a regular member's colleague has neither field and keeps seniority; a
  manager and a view-only admin get both.
- `npm run type-check`, `npm run lint`, `npm run docs:check` pass; the
  affected web, mobile, contracts, domain and mobile-api-core suites pass.
- Public docs already describe these as staff-manager columns
  (`docs/staff/roster.mdx`); evidence fingerprints re-recorded for the six
  pages whose sources changed.

## Not in this fix

- The mobile person detail route (`GET /api/mobile/people/[id]`) still gates
  the full record on `canManageEmployees`, while the mobile list uses
  `canViewEmployeeDetails`. An admin granted only "View employee details"
  therefore sees the number and employment type in the mobile list but not on
  the mobile person page. Unchanged here, as before.
- An installed mobile build older than this contract requires
  `employeeNumber` on every person, so a regular member on such a build fails
  to parse the People list until the app is updated. No store release has
  shipped.
- Gridmaster screens read full records from their own routes and are
  unchanged.
