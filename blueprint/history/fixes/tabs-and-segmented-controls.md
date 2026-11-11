# Current Feature

## Underline tabs for sections, neutral segmented controls for choices

**Type:** Fix
**Status:** verified
**Design reference:** the "Tabs and segmented controls" canvas,
https://claude.ai/artifact/VUdkgYwo4pXcPnywm4zRCJ (approved by the owner,
2026-11-10). Web only; the mobile app is unchanged.

## The problem

The web app uses one pill control (`SpanTabs`, `.dg-span-tabs--light`) for two
different jobs, and a second, older underline style in one place:

- **Page and panel sections** (the staff page, My profile, the shift requests
  panel) use the pill control. Design systems (Material 3, Apple HIG, GitHub
  Primer, Fluent 2, Atlassian) put sections under underline tabs and keep the
  segmented control for switching views of the same content.
- **The selected segment is solid brand blue** (`.dg-span-tab.active`,
  `.dg-segment-btn.active`), the same fill as the primary button. Our button rule
  says solid blue is the action we want completed, so a toolbar with a view
  switch beside Publish shows two "main" actions.
- **The Gridmaster organization page** (`components/gridmaster/OrganizationDetail.tsx`)
  draws its own underline tabs with inline styles, eight of them, with a blue
  label.
- Most toolbar users hand-roll the pill markup and its dividers with inline
  styles rather than using `SpanTabs`.

## The fix

One rule, two shared controls:

| Use                                                                | Control               | Look                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Choosing a section of a page or panel (different content)          | `UnderlineTabs` (new) | 1px bottom rule; selected label dark and semibold with a 2px brand underline; others muted; counts as a neutral badge; scrolls sideways when it doesn't fit        |
| Switching a view, filtering one list, or answering a form question | `SpanTabs` (restyled) | Gray track (`--dg-color-bg-secondary`), 3px inset; the selected segment is the surface color, raised with a light shadow, dark semibold text; no dividers; no blue |

Surfaces and what they become:

| Surface                              | File                                                                                        | Becomes                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Staff page sections                  | `components/staff-detail/StaffDetailPage.tsx`                                               | Underline tabs                                                                                                                                                                                         |
| My profile sections                  | `components/profile/ProfilePage.tsx`                                                        | Underline tabs                                                                                                                                                                                         |
| Shift requests panel                 | `components/ShiftRequestBoard.tsx`                                                          | Underline tabs, counts kept                                                                                                                                                                            |
| Gridmaster organization page         | `components/gridmaster/OrganizationDetail.tsx`                                              | Six underline tabs: Overview, People, Schedule, Activity, Billing, Configuration. People holds a segmented Staff / Accounts / Invitations switch over today's Employees, Users and Invitations content |
| Schedule toolbar span                | `components/Toolbar.tsx`                                                                    | Segmented                                                                                                                                                                                              |
| Dashboard Week / 2 Weeks             | `components/dashboard/DashboardHeader.tsx`                                                  | Segmented                                                                                                                                                                                              |
| Alerts Inbox / Archived, read state  | `app/(app)/alerts/AlertsInboxPage.tsx`                                                      | Segmented                                                                                                                                                                                              |
| People status and department filters | `components/staff/MembersSection.tsx`                                                       | Segmented, counts kept                                                                                                                                                                                 |
| Activity period                      | `components/activity/PeriodNavigator.tsx` (activity log, person timeline, Gridmaster audit) | Segmented                                                                                                                                                                                              |
| Schedule Builder view and focus area | `components/CoveragePanel.tsx`                                                              | Segmented                                                                                                                                                                                              |
| Shift picker focus area              | `components/ShiftPicker.tsx`                                                                | Segmented                                                                                                                                                                                              |
| Left early / Arrived late            | `components/ShiftEditPanel.tsx`                                                             | Segmented                                                                                                                                                                                              |
| Recurring frequency, Keep / Reset    | `components/RepeatForm.tsx`                                                                 | Segmented (the `.dg-segment-grid` too)                                                                                                                                                                 |
| Print view and font size             | `components/PrintOptionsModal.tsx`                                                          | Segmented                                                                                                                                                                                              |
| Jobs matching rule                   | `components/settings/Jobs.tsx` (`.dg-segment-grid`)                                         | Segmented                                                                                                                                                                                              |
| Billing months and history filter    | `components/settings/billing/SeatHistoryChart.tsx`, `BillingHistoryCard.tsx`                | Segmented, equal widths kept                                                                                                                                                                           |

Must not break:

- Each surface keeps its options, labels, counts, disabled states, `?tab=` and
  legacy tab links (`LEGACY_TABS`, profile `?section=`), the request board's
  `initialTab`, and the dashboard tour anchor (`data-tour="dashboard-view-mode"`).
- Gridmaster: an `initialTab` of `users`, `employees` or `invitations` opens
  People on the matching list, so existing links still land in the right place.
- Underline tabs are a real `tablist`: `role="tab"`, `aria-selected`,
  `aria-controls` on the panel, roving focus with Left/Right, Home and End. The
  segmented control keeps its `aria-pressed` buttons in a labelled group.
- Dark mode: the selected segment must read lighter than the track. If
  `--dg-color-surface` sits darker than `--dg-color-bg-secondary` in dark mode,
  use the raised surface token (or add one) rather than a local hex.
- No inline styles in what this touches; tokens only; tabular numerals for
  counts; button labels never wrap.

## Build steps

- [x] **0. Prototype.** The canvas above covers every surface in the table,
      desktop and 390px, and the owner approved it on 2026-11-10.
- [x] **1. Shared controls.** Add `components/ui/underline-tabs.tsx`
      (`UnderlineTabs<T>` with `items`, `value`, `onChange`, `aria-label`,
      optional `count`, and an id helper for `aria-controls`) and its
      `.dg-underline-tabs` CSS in `app-ui.css`. Restyle `.dg-span-tabs--light`
      and `.dg-segment` to the neutral look, drop `SpanTabs`'s dividers, and set
      the count badge's selected and unselected tones. Update
      `neutral-control-chrome.test.ts` to the new contract.
      **Done when:** `UnderlineTabs` has tests for selection, counts and
      keyboard focus (Left, Right, Home, End), the contract test passes, and
      `npm run type-check` passes.
- [x] **2. Sections move to underline tabs.** Staff page, My profile and the
      shift requests panel use `UnderlineTabs`; the staff page's month stepper
      stays on the tab line, and in the requests panel the tabs run to the
      panel edges and scroll.
      **Done when:** `StaffDetailPage.test.tsx` and any profile or request board
      tests pass against the tab roles, and at 1280px and 390px each surface
      matches its canvas board in light and dark.
- [x] **3. Gridmaster organization page.** Replace the inline-styled tabs with
      `UnderlineTabs`, fold Users, Employees and Invitations into People with a
      `SpanTabs` switch (Staff, Accounts, Invitations), and map the old tab ids.
      Update `e2e/gridmaster-portal-states.spec.ts` (it clicks the Users,
      Employees and Invitations tabs) and any internal doc that names the old
      tabs.
      **Done when:** the e2e spec passes, each old `initialTab` opens the right
      list, and the page has no inline tab styles.
- [x] **4. Segmented users.** Move each hand-rolled `.dg-span-tabs` row
      (Toolbar, DashboardHeader, AlertsInboxPage, MembersSection, PrintOptionsModal,
      RepeatForm, ShiftPicker) onto `SpanTabs` where its markup allows, removing
      the inline divider elements; where it can't (`ScrollableTabs` rows), keep
      the classes but drop the dividers. Update `e2e/interactive-states.spec.ts`
      selectors if the class names change.
      **Done when:** no file outside `ui/span-tabs.tsx` draws a span-tab
      divider, the touched unit tests pass, and every board in the canvas's
      segmented rows matches the app in light and dark.
- [x] **5. Standards and evidence.** Add the rule to
      `blueprint/context/coding-standards.md` under Styling (sections are
      underline tabs; view switches, filters and form choices are the neutral
      segmented control; neither uses solid blue). Run Verify's fallback:
      `npm run type-check`, `npm run lint`, `npm run test:web`,
      `npm run build`, and the two e2e specs above.
      **Done when:** all pass, and screenshots of the staff page, the Schedule
      toolbar and the Gridmaster organization page in light and dark, at 1280px
      and 390px, are attached to the review.

## Outcome

- Built as specified, with three changes made during review (owner,
  2026-11-10): the underline is a square 3px bar with a bold (700) label, a
  count takes its label's color and weight, and unselected tabs and segments
  are muted (`--dg-color-text-muted`) and turn dark on hover.
- The Gridmaster Staff list's own Active / Away / Offboarded row also became a
  segmented control (`organization-detail/EmployeesTab.tsx`); a zero count is
  hidden there, as everywhere `SpanTabs` is used.
- Evidence: type-check, lint, the touched unit tests and `next build --webpack`
  pass (Turbopack can't build from a worktree's symlinked `node_modules`).
  Locally the Gridmaster tab walk passed in Chromium and Firefox; the hover
  test's failure led to the muted-label change, and its rerun, the WebKit
  sign-ins and the apex "Go home" step were blocked by the local login rate
  limit and HTTPS headers, so the pull request's CI run is their gate.
  Screenshots were taken of the staff page, the Schedule toolbar and the
  Gridmaster organization page in both themes at 1280px and 390px.

## Verify

1. Open a person from People: the sections are underline tabs, Requests shows
   its count, Left and Right move between tabs, and `?tab=shifts` still opens
   Schedule.
2. Open My profile and the shift requests panel: same tabs; the panel's tabs
   scroll sideways when narrow.
3. On Schedule, the Week / 2 Weeks / Month switch is a gray track with a white
   selected segment, and Publish is the only blue control on the toolbar.
4. Click through Dashboard, Alerts, People filters, the activity log, the
   Schedule Builder, a shift's absence, Repeat, Print, Jobs and Billing: every
   choice uses the same neutral segmented control.
5. In Gridmaster, open an organization: six tabs; People switches between
   Staff, Accounts and Invitations; an old link to Users opens Accounts.
6. Repeat 1, 3 and 5 in dark mode and at 390px wide.
