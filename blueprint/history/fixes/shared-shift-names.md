# Fix: shifts that share a name across focus areas

**Type:** Fix
**Status:** complete

## Problem

Shift names are unique only within a focus area, and an org-wide shift can
share a name with an area's. Some code grouped or looked shifts up by name or
label, so two different shifts merged or the wrong one was picked (the staff
hours report added "Day" in two areas into one row). About 25 surfaces named
a shift with no focus area in a list or text that mixes areas, the Reports
shift filter among them.

## Fix

- **One label helper:** `shiftDisplayName` and `shiftDisplayNamesById` in
  `@dubgrid/domain` give "Day Shift (East Wing)" only when another active
  shift in the organization has the name; an org-wide shift stays bare. They
  replace the local versions in Preferences and Jobs.
- **Ids, not names:** the staff hours and staff activity breakdowns key by shift
  and job id; `getShiftStyle` never guesses between two areas' label; the Day
  view tally, the edit panel's label fallbacks, the dashboard's shift lookup and
  old recurring drafts prefer the cell's or person's own area; grid totals key by
  category id.
- **Reports:** the shift filter lists shifts under their area; the call-off table
  and the schedule matrix carry a focus-area column in the org's term, and a
  matrix cell names the area of work outside the person's own.
- **Print:** the shift key groups under area headings.
- **Web text:** My schedule, the staff page calendar, recurring pills and Requests
  tab, the admin action queue, the request confirmation, the Preferences summary,
  open-shift staffing, the Auto-build overlap reason, mentoring lines and the
  dashboard's older "Was" summary name the area where needed.
- **Exports and server text:** both schedule CSVs (the Schedule page's Export
  CSV and `/api/export`) have an area column and name cross-area work; calendar events carry the area in the title and location; the
  pickup activity line (web and mobile) and Settings shift audit rows name it;
  the Gridmaster read-only view shows each shift's own area.
- **Mobile:** the server keeps two same-named shifts apart in a split's name and
  gives request segments the shift's own area; the approvals row spells the
  shift out with its area; split-shift labels (always on swap targets), "Working
  with" and note headings, Team tab groups, the "Also" badge and the old change
  text name the area when needed.

## Evidence

- `npm run type-check` and `npm run lint` pass from the worktree.
- `npm run test`: every workspace passes; one live-database test
  (`schedule-children-org-consistency`) failed once under a concurrent session's
  run on the shared local database and passed 4/4 alone.
- The new staff hours test fails on the old code ("Day (2, 14h)").
- New tests cover the helper, the CSV, the calendar feed, the audit rows and
  headline, the mobile name join, mobile note titles and change text, the print
  legend grouping and the area-aware lookups.
- Browser: Settings > Jobs and the Reports filter at Evergreen Care.
- Public docs: Reports and Integrations and Exports describe the area naming;
  `npm run docs:check` passes with the 24 affected pages' evidence recorded.

## Not in this fix

- Publish History's fallback for rows saved before Before and After still names
  bare shifts; that panel has no focus-area data.
- Month view's label fallback, used only without an assignment id, still hints
  with the person's first home area.
- No browser check of the print key, dashboards or staff page, and no simulator
  check of mobile.
