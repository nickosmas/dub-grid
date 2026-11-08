# Fix: Dropdowns never wider than they need to be

**Type:** Fix
**Status:** complete
**Branch:** `fix/dropdown-widths`

## The problem

Dropdowns across the web app stretched past their content (owner, 2026-11-07):

- Filter rows (Alerts, Requests history, Settings activity log, the person
  activity timeline, Gridmaster All Users, Security and Audit Log, the Schedule
  Builder focus area) gave every `CustomSelect`, `StaffMultiSelect` and
  `DateRangePicker` `flex: "1 1 auto"`, so each grew to share the row's
  leftover width. "All categories" became a 210px bar.
- Reports gave every labelled filter `flex: "1 1 auto"` with the control at
  100% of its label, so seven filters shared the whole row.
- Settings > Schedule rules put each control straight in a column flex, which
  stretched "Counts fully" across the card (1078px for a 126px label).
- `CustomSelect`'s wrapper had no `min-width: 0` or `max-width`, so a narrow
  row couldn't shrink it to an ellipsis, and menu options could wrap.

The 2026-09-21 rule "toolbars are wrapping rows of content-sized fields that
share the leftover width" is narrowed: the search field takes the leftover
width, dropdowns stay at their content width.

## The fix

- `CustomSelect` and `StaffMultiSelect`: the wrapper defaults to
  `min-width: 0` and `max-width: 100%`, so a trigger sizes to its label and
  truncates instead of overflowing. Options sit in `.dg-menu-item-label`,
  one line, truncated at the menu's 350px cap with the full label as a
  tooltip. Menus already size to their longest option, no narrower than the
  trigger.
- Filter rows: dropdowns are `flex: "0 1 auto"`; the search field keeps the
  leftover width.
- Reports: labelled filters are content-sized, the people and focus area
  pickers truncate their summary, keep a gap before the chevron, and open a
  list as wide as its longest name (240 to 340px).
- Schedule rules: rule rows align their control to the start.
- Left alone on purpose: form fields lined up in a form grid or modal
  (`width: 100%`), the time zone field in organization location forms, the
  activity period label between the arrows on phones (a stepper), and
  `ProfilePage.tsx`.

## Steps

- [x] 1. Shared components: `CustomSelect`, `StaffMultiSelect`, one-line
      options.
- [x] 2. Call sites: Alerts, Requests history, Settings activity log, person
      activity, Gridmaster All Users, Security and Audit Log, Schedule
      Builder, Add Staff's access role, Reports, Schedule rules.
- [x] 3. Before-and-after screenshots at 1440px and 390px, light and dark.

## Verification

- `npm run type-check`, `npm run lint` (two existing `<img>` warnings in
  untouched files) and `npm run test:web` pass.
- A scan of every org page and Settings section at 1440px and 390px, and
  every Gridmaster view at 1440px, measured each dropdown trigger against its
  label: after the fix none outside a form field is more than 30px wider than
  its label needs.
- Screenshots of Alerts (with the category menu open), Requests history,
  Settings activity log, Schedule rules, Reports and Gridmaster All Users,
  Security and Audit Log, before and after, at 1440px and 390px in light and
  dark.
- Not shown: the Schedule Builder's focus area filter (the local data has no
  coverage requirements, so the panel shows its empty state) and the person
  activity filters (the seeded people have no activity this month). Both use
  the same change as the rows above.
