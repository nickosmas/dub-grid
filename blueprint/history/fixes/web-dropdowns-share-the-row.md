# Fix: Some dropdowns take the rest of the row

**Type:** Fix
**Status:** complete
**Branch:** `fix/reports-filters-fill-row`

## The problem

After `web-dropdown-widths` made every dropdown hug its label, some rows read
worse than before (owner, 2026-11-08, "in some cases we might have to make
them take the rest of the space width, e.g. in Reports"):

- Reports' seven labelled filters stopped short of the row's end.
- Requests history's four filters (dates, type, outcome, staff) did the same.
- The Schedule Builder's focus area filter and Add Staff's access role sit in
  a narrow panel or a form row, where a short field leaves a gap.
- On phones, wrapped filter rows (Alerts, Requests history, Settings activity
  log, person activity, Gridmaster Audit Log and Security) ended raggedly
  instead of flush.

## The fix

- Reports, Requests history, the Schedule Builder filter and Add Staff's
  access role share the row again at every width, as before
  `web-dropdown-widths`. Reports keeps that fix's truncated summaries, the
  gap before the chevron and content-sized lists.
- `CustomSelect`, `StaffMultiSelect` and `DateRangePicker` give their wrapper
  the class `dg-select`. At 640px and below, a `dg-select` in a
  `dg-filter-row` or `.dg-activity-toolbar-filters` grows to share its line.
  Above that it still hugs its label, and the search field takes the leftover
  width. Alerts and Gridmaster Security mark their rows `dg-filter-row`, and
  those call sites drop their inline `flex` so the stylesheet applies.
- Unchanged: Settings > Schedule rules (each control hugs its label under the
  description), the Gridmaster All Users row, and form fields.
- The rule in `coding-standards.md` lists when a dropdown takes the rest of
  the row.

## Steps

- [x] 1. Restore sharing for Reports, Requests history, the Schedule Builder
      filter and Add Staff's access role.
- [x] 2. Phone rule for wrapped filter rows.
- [x] 3. Screenshots at 1440px and 390px, light and dark.

## Verification

- `npm run type-check`, `npm run lint` and `npm run test:web`.
- Screenshots of Reports, Requests history, Alerts, Settings activity log and
  Gridmaster Audit Log and Security, before `web-dropdown-widths`, after it,
  and now.
