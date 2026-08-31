# Staff shift activity reporting

**Type:** Fix

**Status:** verified

## Problem

Reports could not answer staff-specific scheduling questions such as how many
Day shifts a person worked, whether they were scheduled off, or their
call-off, swap, and pickup activity over a selected period.

## Resolution

- Extended the report data model and API with shift-category filtering,
  staff-activity summaries, and auditable request events using stored
  request snapshots.
- Rendered and exported a detailed Staff activity report and a compact
  shift-category breakdown on Staff hours, with shift-category selection in
  the Reports UI. Separated published absences from unscheduled days, and
  distinguished approved schedule impact from all submitted request activity.
- Added focused server and UI coverage for shift filtering, off-day states,
  request roles/statuses, and export parity.
- Repaired F-06 - the Export dropdown now announces itself as a menu.
- Removed the redundant "Configure report" heading from the Reports controls.
- Aligned the subscription action with the right edge of the Billing page
  controls.
- Repaired F-12 - mobile employee updates and their activity record are now
  atomic (one service-only database function, audit insert failure rolls
  back the employee update).
- Repaired F-13 - Activity Log entries expose their detail popup through a
  standard, accessible button instead of a bare clickable row.
- Repaired F-14 - web bulk security-session sign-outs require an explicit,
  scope-specific confirmation before running.

## Verification

- Full monorepo `npm run type-check` (all 24 workspace tasks) - passed.
- Full monorepo `npm run lint` - 0 errors (148 pre-existing warnings,
  unrelated).
- Full monorepo `npm run test` - 312 web test files / 2607 tests passed;
  full mobile suite passed.
- `npm run build` (web production build) - passed.

## Findings

### staff-shift-activity-reporting/F-03 [P2] closed

Capped Auth-user lookups at 25 concurrent requests via a shared batching
helper; gridmaster memberships filtered out before any Auth call.

### staff-shift-activity-reporting/F-05 [P2] closed

The 1,800-line mobile-mockup landing component is now a client-only dynamic
import with a height-reserving placeholder, off the landing page's first
load.

### staff-shift-activity-reporting/F-06 [P2] closed

The Export trigger now declares `aria-haspopup="menu"`, matching its actual
`role="menu"` popup.

### staff-shift-activity-reporting/F-07 [P1] closed

Mobile employee-edit audit entries now diff against the pre-update snapshot
and record only changed fields with before/after values.

### staff-shift-activity-reporting/F-08 [P1] closed

Gridmaster audit-log filters now apply in the database function before
pagination, so a matching row beyond the first page or export limit is no
longer silently dropped.

### staff-shift-activity-reporting/F-09 [P1] closed

Mobile audit-write failures are now best-effort after a committed mutation
and no longer turn a successful mutation into a failed API response.

### staff-shift-activity-reporting/F-10 [P2] closed

Organization Activity Log search is now sent to a server-side, paginated
filter instead of only matching the current in-memory page.

### staff-shift-activity-reporting/F-11 [P2] closed

Web employee-change audit rows now resolve certification, role, focus-area,
and department references to readable before/after names.

### staff-shift-activity-reporting/F-12 [P1] closed

Mobile employee updates and their audit record are now committed by one
service-only database function; an audit insert failure rolls back the
employee update.

### staff-shift-activity-reporting/F-13 [P2] closed

Every Activity Log row now has a standard "View details" button with valid
interactive semantics, alongside the existing pointer-click shortcut.

### staff-shift-activity-reporting/F-15 [P2] closed

Absence Types, Indicators, Scheduled Jobs, and Shift Categories now expose
their expandable rows through native button semantics (`aria-expanded`,
`aria-controls`) instead of a bare clickable div.

### staff-shift-activity-reporting/F-16 [P2] closed

Scheduled-job editing now keeps Basics open and collapses Placement,
Per-shift Settings, and Eligibility into summary-bearing subsections.

### staff-shift-activity-reporting/F-17 [P2] closed

The per-day Coverage grid now switches to a responsive two-column layout
below the mobile breakpoint instead of forcing seven equal-width columns.

### staff-shift-activity-reporting/F-18 [P2] closed

The shift-display-mode choice cards now expose `aria-pressed` selected
state for assistive technology.

### staff-shift-activity-reporting/F-19 [P2] closed

Billing activity rows now use an ordinary table row with a visible "View
details" button instead of a focusable, keyboard-handled `tr`.

### staff-shift-activity-reporting/F-20 [P2] closed

Settings reorder handles (Roles, Certifications, Departments, focus areas)
now support Arrow Up/Down keyboard reordering, not pointer-drag only.

### staff-shift-activity-reporting/F-21 [P2] closed

Shifts settings now honor the organization's Full Names display mode
instead of always showing the abbreviated code alongside the name.

### staff-shift-activity-reporting/F-22 [P2] closed

The desktop settings sidebar's pinned footer now renders its "Danger Zone"
group label above Delete Organization.

### staff-shift-activity-reporting/F-23 [P2] closed

The Settings route now renders a labelled loading skeleton instead of a
visually blank content area while data resolves.

### staff-shift-activity-reporting/F-24 [P3] closed

The computed employee count is now a labelled read-only metric instead of
an editable-looking input.

### staff-shift-activity-reporting/F-25 [P3] closed

Display-mode helper copy now accurately describes which settings previews
follow the organization's display preference.

### staff-shift-activity-reporting/F-26 [P2] closed

The shiftless-job editor's color and timing controls now use a
content-width grid instead of splitting across two equal-width columns.

### staff-shift-activity-reporting/F-27 [P2] closed

Every lazily-loaded settings panel now shares a labelled, card-sized loading
skeleton instead of rendering nothing while its chunk loads.

### staff-shift-activity-reporting/F-28 [P2] closed

Departments, Roles, and Certifications now place their Edit action near the
section heading instead of after a long read-only list.
