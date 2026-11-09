# Fix: one order for shift, job, schedule area and time

**Type:** Fix
**Status:** complete

## Problem

Shared shift names showed their schedule area in brackets ("Evening Shift
(Skilled Nursing)"), and the app had no single order: Before and After put
the time before the area, coverage rows and report tables led with the area,
mobile wrote "Day Shift in East Wing", and some cards listed the area before
the job.

## Fix

The owner's order, everywhere a shift is named: shift, then job, then
schedule area, then time (owner, 2026-11-08). Design reference: the "Area,
shift, job order" canvas.

- **No brackets:** `shiftDisplayName` gives "Day Shift · East Wing";
  `sharedShiftFocusArea` gives the area alone for a card's own line or to
  follow a job. The area still shows only where two areas share the name.
- **Cards:** the dashboard week card, staff page recurring pills and Jobs
  settings put the area on its own line under the shift and job; every month
  calendar card has room for three lines, "Morning", "Staff" and "East Wing"
  (owner, 2026-11-08); the split-shift hero
  shows job pills before the area.
- **Before and After** (grid, activity log, Publish History, alerts, emails,
  push, mobile What changed) put the area ahead of the time; so do the grid
  hover card, swap cards, schedule rows and the older "Was" text.
- **Lines of text:** reports breakdowns, the schedule matrix, both schedule
  CSVs, the pickup activity line, the request confirmation, open-shift
  staffing and the mobile labels use "Shift · Job · Area"; sentences keep
  "in".
- **Area-first labels flipped:** Auto-build's coverage rows ("Day Shift · Med
  Aide · North Wing") and the Mentoring and Coverage report columns.
- **Mobile:** Team headers and Working with put the area under the title;
  open shift cards list the job before the area; shift detail shows the area
  before the time; the approvals row, Choose shift and the "Also" badge use
  the dot.
- Grouped lists keep their area headings (Reports filter, print key,
  Auto-build matrix).

## Evidence

- `npm run type-check`, `npm run lint` and `npm run test` (every workspace)
  pass from the worktree.
- Tests updated for the new order across schedule-core, domain, web and
  mobile; the domain helper tests cover both forms.
- Public docs (Reports, Integrations and Exports, Dashboard, Mobile schedule,
  Organization activity) describe the order; `npm run docs:check` passes.
- Browser: the staff page month calendar and Jobs settings at Evergreen Care.

## Not in this fix

- The dashboard week card and mobile screens were not checked in a browser or
  simulator; they are covered by type-check and tests.
