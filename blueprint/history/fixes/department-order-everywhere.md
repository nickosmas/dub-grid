# Fix: departments and their focus areas in Settings order everywhere

**Status:** complete

## Problem

A focus area's stored order only counts inside its department, but many
lists ordered focus areas by it across departments. In Arden Wood, Coverage
listed Visiting Nursing first although Departments puts Nursing and its
three wings first. Other lists named a person's focus areas or departments
in the order they were saved, sorted them alphabetically, or by id.

## Fix

- Web: `useOrganizationData` orders focus areas by department
  (`orderFocusAreasByDepartment`), so every screen reading it follows
  Settings: Coverage, Shifts, onboarding, the schedule's filter, Month and
  Day views, shift picker, People filters and forms, and the dashboard.
- A person's focus areas, departments and roles now follow Settings order
  on the People list, staff page, profile, read-only panel, management
  panel, profile change requests and the staff CSV.
- Jobs' focus area checklist, the dashboard's open shifts filter, and the
  Gridmaster config tab and person card follow the same order.
- Server: reports (filters, Focus areas, Departments and Roles columns,
  coverage rows), the staff CSV export, the new-person alert email, and the
  "has shifts in" question order focus areas by department.
- Mobile: management department names, the People row, person detail, and
  the staff hours, open shifts and coverage filters; the mobile API's focus
  area rows come in Settings order too. The mobile coverage list itself
  still leads with the worst covered, on purpose.

## Evidence

- Type-check and lint pass for web, mobile and `data-access`; the affected
  web suites (889 tests) and mobile people and department tests pass. New
  test: the "has shifts in" question names areas in department order.
- In the browser, local Evergreen Care (North Wing belongs to the first
  department but has a later stored order): Shifts lists East, West, North,
  then Garden, matching Departments, where it used to put Garden before
  North.
- Mobile not run on a device.
