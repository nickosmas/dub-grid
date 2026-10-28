# Fix: Set first day for someone who hasn't started

**Type:** Fix
**Status:** verified

## The problem

After `first-day-future-only`, the person form offered First day only while
one was ahead. A hire added without one (mobile Add person left empty, the
setup wizard, an import), or one whose first day was cleared, could never be
given one, which the owner asked to close (2026-10-28).

## The fix

- `POST /api/employees/manage` `fetchEmployeeHasStarted` (managers only):
  whether the person has a worked shift on or before the organization's
  today, from `schedule_cells` with an inner join to a segment, so an
  absence-only day doesn't count; draft or published alike.
- `EditEmployeePanel`, for someone Active with no first day stored and an
  `orgId` (not the self profile), asks once and, if they haven't started,
  shows a quiet **Set first day** button beside Employment that opens the
  First day field. Staff who have worked a shift never see it; a failed
  check hides it.
- Roster and detail pages and the overview's 51g4 line say so.

## Checks

- Route tests: started with a worked cell on or before today (the query
  filters `lte date` today and joins segments `!inner`), not started with
  none. Panel tests: the button shows and opens the field for someone not
  started, never for someone who has. 217 of 217 across the route, panel,
  staff, profile and employees suites; web type-check.
- Browser, local Calm Haven: a throwaway Active person with no shifts
  showed **Set first day** beside Employment and the field on click; the
  test person was deleted afterwards.
