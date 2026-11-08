# Fix: Jobs settings read clearly

**Status:** complete

## Problem

The "Shift-only assignments" switch sat in the Scheduled Jobs header, so it
read as a mode for every job ("we only assign by shift") rather than an extra
option. Its row read "Shift-only: 2 dept · 4 area · 6 shift" with a second
"Shift-only" tag in link blue, the section description explained the editor
rather than the jobs, rows showed only counts, and the per-shift preview always
used full names whatever the organization's display mode.

## Fix

- The switch has its own first card, **Allow shifts without a job**, holding
  its one row, renamed **Shift only** on screen (the stored job keeps its
  name). The dialog asks "Allow shifts without a job?" or "Require a job on
  every shift?", and the toasts say what changed.
- Scheduled Jobs says what the jobs are: "Jobs worked on a shift, like Charge
  Nurse. Each one sets where it can be scheduled and who qualifies."
- Each row names its departments, schedule areas (in the organization's
  term) and shifts, up to three of each then "+N"; a name shared by several
  shifts appears once. General jobs read "Worked without a shift".
- The per-shift and general-job previews follow the organization's shift
  display mode. This reverses the July rule (47e04dc5d) that settings
  previews always spell out names, at the owner's request (2026-11-08): the
  preview shows the grid pill, and the grid follows the mode.
- Add buttons read "Add scheduled job" and "Add general job".
- Docs: the Jobs section of Shifts, Jobs, and Absences describes the three
  cards; Schedule Display lists the Jobs previews under Short Codes.

## Evidence

- `job-placement-summary.test.ts` covers naming, "+N", empty and repeated
  names.
- The settings tests cover the preview in Code and Name modes and the Shift
  only row inside the new card.
- Seen in the browser on a local Calm Haven (Code mode): the three cards, row
  summaries, Code previews and the Require-a-job dialog, with no console
  errors.

## Not in this fix

- The filled ▾ disclosure arrows, replaced app-wide on fix/stroke-chevrons.
