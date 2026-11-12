# Fix: Mobile People filters take several choices

**Type:** Fix
**Status:** complete
**Branch:** `fix/mobile-people-filter-checkboxes`
**Owner decision (2026-11-11):** "Yes, do mobile", after the web People
filters became checkbox lists (`people-filter-checkboxes`).

## The problem

The app's People filter sheet took one choice per filter, with an "All ..."
row at the top of each, so a manager could not ask for two wings or two
access roles at once, as they now can on the web.

## The change

- `shared/lib/filter-choices.ts`: `toggleFilterChoice` (ticks or unticks a
  choice, keeping the list's order) and `matchesAnyChoice` (nothing ticked
  matches everyone; otherwise any ticked value matches). Tested.
- `shared/components/FilterSheet.tsx`: `SelectionRow` takes `multiple`,
  which draws the existing pick-many ring (`SelectionCheckbox`) on every row,
  ticked when chosen, as a checkbox for screen readers. A ticked row stays in
  the group rather than lifting out as the chosen single-choice row does.
- `features/people/screens/PeopleScreen.tsx`: every filter on both tabs
  (wing, certification, role, employment type, app access and access role on
  On Schedule; administrative team, access role and invitation on
  Administrative Teams) holds a list of ticked choices, and the "All ..." rows
  are gone. A person matches a filter when they match any choice ticked in it,
  and must match every filter that has one. Status and Sort by still pick one:
  status switches which list you are looking at. The Filter badge counts each
  filter with anything ticked.
- `docs/staff/roster.mdx`: the app's People section says filters take several
  choices.

## Evidence

- `PeopleScreen.test.tsx`: a new case ticks User and Super Admin (both
  checkboxes checked, Admin unchecked, both people listed), adds Part-time to
  narrow, and unticks it to turn the filter off. All 1,699 mobile tests pass;
  type-check, lint and Prettier are clean.
- iOS Simulator (iPhone 17 Pro, iOS 26.5), worktree Metro: the sheet shows a
  ring on every row, ticking Skilled Nursing and Night Shift checks both, and
  Done returns to a filtered list with the Filter button in its active fill.
- Not run on Android. The dashboard drill-in sheets (Coverage, Open shifts,
  Activity, Staff hours) still pick one choice.
