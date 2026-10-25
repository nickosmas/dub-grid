# Feature: An absence keeps someone from only the work it covers

**From build-plan:** feature 50g
**Status:** complete
**Completed:** 2026-10-25
**Type:** Feature

## Goal

Requests, volunteering and staffing follow the owner's rule (2026-10-24):
after a left-early absence the person takes no more work that day; an
arrived-late absence blocks only shifts it overlaps. Copying a cell with an
absence copies only its shifts.

## Scope

- **Shared rule:** `absenceBlocksWork` in `schedule-core` ("rest-of-day",
  "overlap" or none), from the absence's span, the work's span and the shift
  to be taken; an untimed absence counts as left early.
- **Database (migration 093):** `rest_of_day_absence_conflict` applies the same
  rule to the published cell, and the nine checks 085 added in the request
  functions (create's two swap checks, claim, volunteer, and the resolver's
  volunteer, pickup and two cross-day swap checks) call it, saying "for the
  rest of that day" or "during that shift". A same-day swap still refuses any
  absence. Create and volunteer are restated from 085, claim from 088, the
  resolver from 092, each changed only at those checks.
- **Web:** open-shift staffing leaves out someone who left early and, after an
  arrived-late absence, only the options it overlaps; the coverage suggestions
  say "Sick for the rest of the day" only for a left-early absence and "Sick
  that day" for an overlap; the mobile volunteer check says "You are absent
  during that time." for an overlap.
- **Paste:** copying a mixed cell copies its shifts with the absence's cut put
  back to the scheduled edge, and says so.

## Completion notes (2026-10-25)

- **Evidence:** schedule-core tests for the rule; web tests for staffing (late
  clear of the shift kept, overlapping left out) and the paste copy; live
  database tests: an arrived-late person claims a later shift and is refused
  the overlapping one ("You are absent during that shift"), and the earlier
  rest-of-day cases with their new wording. The request, claim, auto-approve,
  isolation and absence-time suites pass against the local database with 093.
  `npm run db:migrations:rehearse -- --from 092` applied and qualified 093
  (evidence in
  `internal/operations/migration-rehearsals/2026-10-25-092-to-093.md`).
- **Before release:** apply 093 to production before the release PR merges.
