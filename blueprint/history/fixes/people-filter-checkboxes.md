# Fix: People filters are checkboxes, several to a filter

**Type:** Fix
**Status:** complete
**Branch:** `fix/people-filter-checkboxes`
**Owner decisions (2026-11-11):** "each item should be a checkbox allowing for
multiple selections", "all items should be checkboxes, including current
dropdowns", "all of them should be in their own row", then "Build it" on the
People filters prototype canvas. Web only; the mobile filter sheet is
unchanged.

## The problem

The People filter panel took one choice per filter: capsules for the short
ones (#490) and dropdowns for the long ones. Nobody could ask for two access
roles, two wings or two certifications at once.

## The change

- `components/ui/checkbox-choices.tsx`: `CheckboxChoices`, a named group of
  `.dg-checkbox` inputs, one labelled row each, any number ticked. The ticked
  values come back in list order, and a count shows as the shared quiet
  count with its screen-reader label. It replaces `CapsuleChoices`, which
  had no other user and is deleted with its styles.
- `useStaffFilters.ts` and `useManagementFilters.ts`: every filter holds an
  array of choices, empty meaning off. A person matches a filter when they
  match any choice ticked in it, and must match every filter that has one.
  The "All" choices are gone.
- `StaffFilterPopover.tsx` and `ManagementFilterPopover.tsx`: every filter,
  the former dropdowns included, is its name over a checkbox list, with a
  **Clear** beside the name once something in it is ticked
  (`FilterField`'s `onClear`).
- `StaffContextBar.tsx`: still one pill per filter, naming every choice
  ("Access role: Admin, User"). Certification pills now always carry the
  certification label.
- `DirectoryCertificationCards.tsx`: a tile ticks or unticks its choice in
  the Certifications filter and leaves the others.
- `MembersSection.tsx`: reorder is offered only while every filter is empty.
- `app-ui.css`: each filter stacks its name over its list; rows are 30px on
  desktop and 44px in the phone sheet, filters 14px apart (18px on a phone).
  The panel scrolls with the shared cue, as before.
- `coding-standards.md`: a filter in a filter panel is never tabs or a
  dropdown; every choice is a checkbox on its own row.
- `docs/staff/roster.mdx`: says a filter can take several choices. Evidence
  re-recorded for roster, and for invitations and integrations-exports,
  whose fingerprints include `MembersSection.tsx` and `StaffContextBar.tsx`;
  their claims are unchanged.

## Result

- `checkbox-choices.test.tsx` (5), `useManagementFilters.test.ts` (3, new),
  and `useStaffFilters.test.tsx` (4 new cases for several choices, existing
  cases moved to arrays) pass. `StaffView.test.tsx` and
  `MembersSection.test.tsx` tick checkboxes where they picked capsules and
  dropdown options, and a new case ticks two Account choices and reads
  "Account: Linked, No email". The web suite otherwise passed in full
  (792 files) before those two were moved.
- In a local browser (Calm Haven, QA Super Admin): every filter shows its
  checkboxes (Employment 2, Departments 2, Wings 4, Certifications 8, Roles
  10, Account 4, Access role 3, Phone 2); ticking Super Admin listed 6 rows,
  adding Admin 7, adding a wing 5, and Clear filters unticked everything.
  Light, dark and the 390px phone sheet were captured.

## Not done

- The Administrative Teams panel was checked through its tests and shared
  components, not in the browser.
- Filters outside the panel (Schedule, Alerts, Billing history, Gridmaster,
  import review) are unchanged.
