# Fix: Shifts that use an archived job keep working as history

**Status:** complete

## Problem

Settings promises an archived job "stays on past schedules but can't be picked
for anything new". Archiving a job that shifts still used broke those shifts:

- Web: the grid and edit panel showed "?", a time-only edit was refused with
  "That assignment is no longer available.", copy did nothing, and an
  Auto-build Undo holding such a cell aborted. Before and After marked the
  shift itself "(archived)" when only its job was.
- Mobile: the shift read "?" with no times or colors, and staff hours could drop
  it.
- Outputs: the calendar feed and CSV export lost its hours and times, reports
  printed "Unknown job", and the coverage report still counted requirements for
  the archived job.
- Writes went the other way: drag, paste and Fill from Recurring could put an
  archived job on a new day, since nothing on the server checked.
- Requests: claiming a pickup or answering a swap on such a shift raised "One
  or more schedule state jobs were not found", one pending request on an
  archived job refused every volunteer that day, and editing a repeating series
  that had one failed.

Confirmed on a local stack by archiving two jobs in use (the grid went from
"Ofc", "DS1", "NS1" to "?", and the mobile schedule returned "?" with no times
or colors), and by the tests below.

## Fix

An archived job stays on cells that hold it and takes no new work, the same rule
129 uses for shifts without a job while they're off.

- Display: the label map and the pair-to-assignment lookups keep archived
  assignments (an active one wins a tie), the schedule page resolves segments
  against every assignment, and the edit panel names and times the archived
  ones its own cell holds while the picker still offers only active ones. The
  server's pair map, published output (calendar feed, CSV), the mobile job
  reads and staff hours include archived jobs; open shifts and coverage don't.
- Reports name archived jobs, leave them out of the Job filter, and require
  nothing of them in coverage.
- Migration 130: the draft writer refuses an archived job a cell doesn't already
  hold (saves, paste, drag through `move_shift`, Fill from Recurring), as does
  volunteering; Import Previous Schedule skips such a day with the reason
  `archived_job`; editing a series may keep one only if the series has it.
  Claiming, answering a swap, and volunteering's reads of other pending
  requests use `resolve_existing_schedule_state_storage` (117). New series and
  new requests keep the strict resolver.
- Paste and drop refuse with a message, the route answers 130's refusal with
  422 `ARCHIVED_JOB`, and Fill from Recurring (page and route) skips templates
  with an archived job.
- Docs: Shifts, Jobs, and Absences says what happens to shifts that keep one.

## Evidence

- `migration-130-archived-jobs.integration.test.ts`: refused on a new cell and
  by drag, kept on a held cell (published or draft) with a time change, claim
  and swap answer go through, volunteering isn't blocked by someone else's
  request and is refused for an archived job, and series edits keep only a held
  one, and import skips one with its reason. 8 of 9 fail with only 129
  applied; the held-cell case is a guard.
- `archived-job-history.test.ts`, `shift-change-web.test.ts`, the route,
  mobile data and report tests: 5 library cases, the route's 422 and recurring
  skip, and the report's coverage and filter fail on the old code.
- Browser, local stack: the grid names the cells again, a time-only edit saves
  to the draft, copy works and paste onto another day is refused with the
  message. The mobile schedule endpoint returns the names, times and colors.

## Not in this fix

- Archived shifts and focus areas: published output and job placement still
  drop an archived shift from a pair.
- The "Allow shifts without a job" setting, which is being redesigned
  separately.
