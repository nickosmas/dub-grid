# Fix: Turning off shifts without a job stops new ones

**Status:** complete

## Problem

**Allow shifts without a job** (Settings > Jobs) only hid the option in the
shift pickers. Auto-build and its suggestions, Fill from Recurring Schedules,
copy and paste, dragging, repeating shifts, Import Previous Schedule and
volunteering for an open shift could all still create one, and Settings >
Coverage hid requirements for them while they kept counting. The dialog said
everything "keeps working as before", which wasn't true either way.

A shift without a job is a real assignment that counts toward coverage, so
turning the setting off has to stop new ones everywhere, and archiving the
default shift job would break the ones already scheduled.

## Fix

The setting gates new work; what's already scheduled stays (owner, 2026-11-08).

- Migration 129: the draft writers (`write_schedule_cell_snapshot` and
  `write_schedule_cell_snapshot_internal`) refuse a shift without a job a cell
  doesn't already hold, in its draft or the published schedule, while the
  organization has them off. Import Previous Schedule skips one with the reason
  `shift_without_job_off`, and volunteering for one is refused. Published writes
  (approvals, corrections) are untouched, so requests on existing ones settle.
  `shift_without_job_usage` counts what stays for the dialog.
- Auto-build and suggestions plan nobody on one; open-shift gaps only one could
  fill aren't offered on web or mobile; Fill from Recurring and the build's
  recurring step skip those days; paste and drop refuse with a message.
- The route answers the refusal with 422 and plain words, and someone who can
  manage shifts and jobs may now change this one setting (the Jobs page already
  offered them the switch, and the server refused them).
- Settings > Coverage keeps a requirement for one with a note; the Recurring
  Shifts page and the person's schedule say how many recurring days wait; the
  Require a job dialog counts upcoming shifts, recurring days and requirements.
- Docs: Shifts, Jobs, and Absences explains turning it off; Recurring Shifts,
  Coverage, and Coverage and Open Shifts name it.

## Evidence

- `migration-129-shift-without-job-off.integration.test.ts`: new ones refused
  in saves and moves, held ones kept (published or draft), a different shift
  refused, allowed when on, import skipped with its reason, volunteering
  refused, and the usage counts.
- Unit tests: the helper, Auto-build's `qualifiedFor`, the import reason, the
  route's 422 and recurring skip, the settings permission, and the mobile feed
  (which fails without the filter).

## Not in this fix

- Archived jobs breaking existing shifts (the "?" pill, refused claims): a
  separate fix, since it affects any archived job.
- A direct call to the database can still schedule one through a published
  write, which needs approval or correction rights.
