# Fix: People filter popup: a header, the shared controls, and filters that match the list

**Type:** Fix
**Status:** complete
**Branch:** `fix/people-filter-refresh`
**Design reference:** the "People filters" canvas,
https://claude.ai/artifact/7DzeMYdc6EeL2FJQqtVtYR (approved by the owner,
2026-11-11: "continue nonstop until done"). Web only; the mobile app's filter sheet is unchanged.

## The problem

The People page's Filter popup (`components/staff/FilterPanelShell.tsx`,
`StaffFilterPopover.tsx`, `ManagementFilterPopover.tsx`) hasn't really changed
since #203. It was reviewed on 2026-11-10 and run locally at 1280x900 and
390x844.

**How it works**

- An Access role filter shows no pill. `filterOrgRole` never reaches
  `StaffContextBar`, so with only that filter on, the bar shows a lone
  "Clear all" (seen).
- "Department admins only" filters `deptAdminIds`
  (`useStaffFilters.ts:221-226`). No web screen sets that for scheduled staff,
  and it grants nothing while department scoping is parked. The label is also
  hard-coded English.
- Account is Linked or Unlinked (`useStaffFilters.ts:236-239`). The table's
  Account column shows four states (Linked, Invited, Not invited, No email;
  `StaffTableRow.tsx:428-433`), so you can't find who was invited and hasn't
  joined. "Unlinked account" appears nowhere else.
- Email has its own Has email / Missing email group. A linked person always has
  an email, so "Missing email" is the same people as Account "No email".
- The staff panel says "Access"; everywhere else says "Access role".
- The management popover holds Sort and counts it as an active filter
  (`useManagementFilters.ts:53-58`). The staff half sorts from a toolbar
  dropdown.
- Clear all also empties the search box (`useStaffFilters.ts:98`).

**How it looks**

- No header: the desktop popover has no title or close button, and the phone
  sheet's title is screen-reader only with its close button turned off
  (`FilterPanelShell.tsx:78-83`).
- On desktop it opened beside the button with its top 5px from the top of the
  window, under the 56px app header, hiding "Employment" (measured).
- On a phone the footer ends at 865px in an 844px viewport, so Done is cut
  off. The sheet draws its own grabber (`:84-86`), the only one in the web app,
  and the content below it is capped at the sheet's full height (`:41`, `:79`).
- Done is hand-styled with a brand fill; Clear all is bare text. The app's
  `ClearFiltersButton` is a neutral outline reading "Clear filter(s)".
- `FilterChip` has its own colors (a pale brand tint against gray), a `title`
  tooltip that repeats its label, long role names cut off mid-word, and an "All"
  chip in every group: 44 chips and about two screens of scrolling in Calm
  Haven.
- The department-admin checkbox is a raw `<input>` with `accent-*`.

## The fix

One panel shape for both halves of the directory:

| Part                                                                                | Becomes                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Header                                                                              | "Filters" title and a close button, on desktop and phone (`dg-modal-title`, `CloseButton`)                                |
| Short single choices (Employment, Access role, Phone, Invitation)                   | `SpanTabs`, the neutral segmented control                                                                                 |
| Lists (Departments, the org's area label, certification label, role label, Account) | `CustomSelect` rows, label on the left and the dropdown filling the rest of the row, first option "All"                   |
| Footer                                                                              | `dg-footer-bar` with "Clear filters" (`dg-btn-secondary`, disabled when none) and Done (`dg-btn-primary`), as equal peers |
| Desktop placement                                                                   | Opens below the Filter button, never under the app header, height capped to the window                                    |
| Phone                                                                               | The shared sheet header (no hand-drawn grabber), the body scrolls, the footer stays on screen                             |

Staff filters: Employment, Departments, area, certification (All, Certified
staff, Not certified, then each one), role, **Account** (All, Linked, Invited,
Not invited, No email: the table's states), **Access role** (when the viewer can
see it), Phone. Removed: Department admins only, and the Email group, which
Account's "No email" replaces.

Management filters: Access role and Invitation. Sort moves to a toolbar
dropdown ("Sort: Name", "Sort: Access role"), matching the staff half, and
stops counting as a filter.

The bar under the toolbar names every active filter, Access role included, and
ends with the shared `ClearFiltersButton`. Clear filters leaves the search box
alone, which has its own clear button.

Must not break:

- Filters stay per half: the badge and Clear count only the half on screen.
- Regular users still see only the qualification filters, and the Access role
  filter only shows for viewers who can see the Access column.
- The summary cards' certification shortcut still sets the certification filter.
- Organization labels (area, certification, role, department) come from the
  organization, never hard-coded.
- The page still stops scrolling while the panel is open (tested in
  `StaffView.test.tsx`).
- No inline styles in what this touches; tokens only; tabular numerals for
  counts; button labels never wrap.

## Build steps

- [x] **0. Prototype.** A Design canvas with the staff and management panels,
      desktop (1280) and phone (390), light and dark, with real Calm Haven
      labels, plus the bar under the toolbar with an Access role pill.
      **Done when:** the owner approves it, or the changes they ask for are in.
- [x] **1. Filter logic.** In `useStaffFilters`: Account becomes Linked,
      Invited, Not invited, No email, from the same invitation state the table
      reads; remove the department-admin and email filters; Clear filters no
      longer clears search. In `useManagementFilters`: sort leaves the filter
      count and Clear.
      **Done when:** `useStaffFilters.test.tsx` covers each Account state and
      the search staying put, and `npm run type-check` passes.
- [x] **2. The panel.** Rebuild `FilterPanelShell` with the header, footer,
      placement and phone sheet above, and both popovers with `SpanTabs` and
      `CustomSelect` rows; delete `FilterChip`. Move management sort to the
      toolbar.
      **Done when:** at 1280x900 the panel opens below the button with its
      header visible, at 390x844 Done is fully on screen, and both match the
      canvas in light and dark.
- [x] **3. The bar under the toolbar.** Pass Access role (and the new Account
      states) to `StaffContextBar`, and replace its "Clear all" with
      `ClearFiltersButton`.
      **Done when:** an Access role filter alone shows its pill.
- [x] **4. Tests, docs and checks.** Update `StaffView.test.tsx` (the
      department-admin and regular-user cases) and `docs/staff/roster.mdx`
      (Filters line) with its accuracy fingerprint. Run `npm run type-check`,
      `npm run lint`, `npm run test:web`, `npm run docs:check` and
      `npm run build`.
      **Done when:** all pass, with screenshots of both panels at 1280 and
      390, light and dark.

## Verify

1. On People, open Filter on a 1280x900 window with the page at the top: the
   panel opens below the button with "Filters" and a close button visible.
2. Pick Access role Admin, then Done: the bar names "Access role: Admin" and
   Clear filters empties it, leaving any search text in place.
3. Pick Account Invited: only people whose table Account reads Invited remain.
4. Switch to Administrative Teams: the panel shows only Access role and
   Invitation, and the toolbar has its own sort dropdown.
5. At 390px the sheet has the same header, scrolls, and shows Clear filters
   and Done in full.
6. Repeat 1 and 5 in dark mode.

## Result

- One rule decides a person's account state (`staff-account-state.ts`), read by
  the table's Account column and the new Account filter (Linked, Invited, Not
  invited, No email).
- Removed: Department admins only (it filtered on data nothing sets) and the
  Email group. Clear filters leaves the search box alone.
- `FilterPanelShell` has a "Filters" header with a close button, `SpanTabs` for
  short choices, `CustomSelect` rows for lists, and Clear filters and Done as
  equal peers; it keeps clear of the app header, and the phone sheet keeps its
  footer on screen. `FilterChip` and the hand-drawn grabber are gone.
- Administrative Teams sorts from a toolbar dropdown, no longer counted as a
  filter. The bar under the toolbar names an Access role filter and uses the
  shared Clear filter button.
- Checked on the local stack (Calm Haven, QA Super Admin): the panel at
  1280x900 in light and dark, an Access role filter naming its pill, the
  Administrative Teams panel and sort, and the phone sheet at 390x844 with Done
  fully on screen (bottom 832px of 844). `npm run build` was left to CI: a
  worktree's symlinked `node_modules` can't build locally.
