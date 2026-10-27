# Feature: Status names everywhere

**From build-plan:** feature 51b (item 51, Staff statuses)
**Status:** verified

## Goal

People see the owner's status names wherever a staff status shows: **Away**
for `inactive` and **Archived** for `removed`, with the actions **Mark away**,
**Archive**, **Mark active** and **Restore** in place of Deactivate, Mark
inactive, Remove from staff, Activate and Reactivate. The person who is away
sees a calm banner instead of the warning bar, and the billing page says who
takes a seat and why.

Only the words and the seat breakdown change. What each status does stays as
51a left it.

## Design reference

The "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo): the Status key, Web People
list, Person page status card, Confirmations, Billing seats, Mobile People list,
Status banners and Gridmaster boards. 51b builds only their Active, Away and
Archived parts: no Suspended, no return date, no last day.

## In scope

- One shared label set in `packages/domain`: status names, action names and the
  dialog copy for each action, used by web, mobile and Gridmaster.
- **Web People list:** tabs All, Active, Away, Archived; the row status pill;
  the empty states; the bulk bar's confirmation (Mark away, Mark active,
  Archive) with the same words as the single actions.
- **Web person page and side panel:** the one Deactivate button with its
  two-choice dialog becomes two peer buttons, **Mark away** and **Archive**,
  each with its own confirmation and optional reason. Mark away shows only when
  `canMarkInactive` (as today). An Away person gets **Mark active**; an Archived
  one gets **Restore**. Toasts say "Marked away", "Archived", "Marked active",
  "Restored".
- **Mobile:** the People status filter (Active, Away and Archived, each its
  own choice; Inactive used to hold Archived people too), the person screen's
  actions, sheets and toasts, with the same words and the same split. The
  mobile list shows one status at a time, so its rows carry no status chip.
- **Gridmaster:** the organization Employees tab, the person page's
  organization card and staff actions, and the staff-without-account search.
  Account-level Deactivate, Reactivate and Reinstate (platform sign-in) stay.
- **Reports, activity log and server messages:** report status labels and the
  CSV column, the activity log headlines for status changes, and the API error
  messages that name a status (for example "Removed employees can't be
  edited.").
- **Banner:** the web away banner becomes a calm, neutral bar reading
  "You're away." (no warning color or alert icon). Mobile shows the same line
  if it has an away notice today; it gains none in 51b.
- **Billing seats:** Settings > Billing breaks the billable users down: Active
  staff; Away, can manage (with their names); Managers without a staff record;
  and, not billed, Away and Archived. The settings description stops saying
  "Inactive and removed".
- **Public docs:** roster, detail page, roles and billing pages use the new
  names, with fingerprints re-recorded.

## Out of scope

- Suspended, a return date, a last day, absence fill and the grid's Away bar
  (51c to 51g).
- New bulk actions or a new bulk bar (51h); 51b only renames the existing bulk
  confirmations.
- Changing what any status does, who can change it, or how removal treats
  memberships (51k).
- Code identifiers, enum values, column names and API field names: `inactive`
  and `removed` stay.
- Gridmaster account actions (Deactivate or Reactivate a user, Reinstate an
  account, Terminate) and organization actions.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the step before any code.
2. Implement just that step.
3. Show the diff and what it delivered.
4. Verify it, then roll on. `/complete` makes the feature commit.

## Build steps

- [x] **Step 1 - Shared names.** `packages/domain/src/employment-status.ts`
      gains `EMPLOYMENT_STATUS_LABELS` (`active` Active, `inactive` Away,
      `removed` Archived), `describeEmploymentStatus(status)` with an Active
      fallback for an unknown value, and the action words and confirmation
      copy (`STATUS_ACTION_COPY`: title, body and button for Mark away,
      Archive, Mark active, Restore, given a name). `NOT_ON_SCHEDULE_MESSAGE`
      says "marked away". _Done when:_ domain tests cover every status, the
      unknown fallback and each action's copy with a name, and the package
      builds.
- [x] **Step 2 - Web person actions.** `EmployeeStatusActions` shows Mark
      away and Archive as two equal peer buttons (Mark away only when
      `canMarkInactive`), each with its own `ConfirmDialog` and reason field,
      and Mark active or Restore for Away or Archived; toasts in
      `StaffDetailPage` and `useEmployees` use the new words; the person
      record card's pill reads Away or Archived. _Done when:_ the component
      test covers both buttons, the management-only case (Archive only), and
      Mark active versus Restore; a screenshot of the person page in each
      status.
- [x] **Step 3 - Web People list.** Tabs All, Active, Away, Archived; row
      pills; empty states; the bulk confirmations; the context bar button.
      _Done when:_ tests that assert the old words are updated and pass; a
      screenshot of the list on the Away tab and the bulk dialog.
- [x] **Step 4 - Away banner.** A neutral bar with "You're away." in place
      of the warning gradient and alert icon. _Done when:_ a screenshot of a
      signed-in Away account in light and dark.
- [x] **Step 5 - Mobile.** People filter and chip, the person screen's
      actions, sheets and toasts, from the shared copy. _Done when:_ the
      mobile tests pass with the new words; a simulator screenshot of an Away
      person and the Mark away sheet.
- [x] **Step 6 - Gridmaster, reports, activity log and server messages.**
      Every status label and staff-record action there uses the shared names;
      account-level actions are untouched. _Done when:_ their tests pass with
      the new words; a screenshot of the Gridmaster Employees tab.
- [x] **Step 7 - Seat breakdown.** `breakdownBillableSeats` in
      `features/billing/seats.ts` returns the counts and the names of Away
      people who can manage; `countBillableSeats` becomes its total, so the
      two can't disagree. The billing summary carries the breakdown and
      Settings > Billing shows it under the metrics. _Done when:_ seats tests
      cover each line, internal accounts, and that the total equals
      `countBillableSeats` for every existing case; a screenshot of the
      breakdown.
- [x] **Step 8 - Docs and copy sweep.** Public docs use the new names and
      fingerprints are re-recorded; a final search finds no user-facing
      Inactive, Removed (as a status), Deactivate, Mark inactive or Activate
      for staff left on web or mobile. _Done when:_ `npm run docs:check`
      passes and the search output is clean apart from the listed exclusions.

## Files / areas

- `packages/domain/src/employment-status.ts` (+ test)
- `apps/web/src/components/staff-detail/` (EmployeeStatusActions,
  PersonRecordCard, StaffDetailPage), `apps/web/src/hooks/useEmployees.ts`
- `apps/web/src/components/staff/` (MembersSection, StaffTableRow,
  StaffEmptyState, StaffContextBar)
- `apps/web/src/components/InactiveAccountBanner.tsx`
- `apps/web/src/components/gridmaster/` (organization Employees tab, person
  page organization card and staff actions, StaffWithoutAccountSearch)
- `apps/web/src/features/reports/shared/table.ts`, `apps/web/src/lib/audit/`,
  server messages in `apps/web/src/app/api/` and `features/mobile/server/`
- `apps/web/src/features/billing/seats.ts`, `server.ts`, `types/index.ts`,
  `components/settings/BillingSettings.tsx`, `nav-config.tsx`
- `apps/mobile/src/features/people/` (PeopleScreen, PersonDetailScreen)
- `docs/staff/roster.mdx`, `docs/staff/detail-page.mdx`,
  `docs/reference/roles.mdx`, `docs/reference/billing.mdx`

## Data / contracts

- **Load-bearing:** `EMPLOYMENT_STATUS_LABELS` and `STATUS_ACTION_COPY` in
  `@dubgrid/domain`. 51c to 51h add Suspended and the dated forms here, so
  every surface must read from them rather than restate a label.
- **Load-bearing:** `SeatBreakdown` on `OrganizationBillingSummary`
  (`seatBreakdown`): `activeStaff`, `awayManaging`, `awayManagingNames`,
  `managementOnly`, `awayNotBilled`, `archived`, `total`. 51c adds a
  Suspended line. `appUserCount` stays and equals `total`.
- No migration, no API field renames.

## Testing

- Domain: labels, fallback, action copy.
- Seats: each breakdown line, names, internal accounts excluded, total equals
  `countBillableSeats`.
- Component and route tests that assert the old words are updated, not
  deleted.
- Browser evidence: person page in each status, People list tabs, bulk
  dialog, away banner in both themes, Gridmaster Employees tab, billing
  breakdown. Simulator evidence for mobile.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`.

## Notes for the AI

- Staff-facing copy names only the state ("You're away."); managers'
  confirmations spell out consequences (copy rule 9). Say "the app", not
  DubGrid (rule 10). Buttons are one to three words and echo the title verb.
- No red for Archive: it is a neutral-weight secondary action, Mark away the
  warning-filled primary, as the Deactivate button is today. Peer buttons are
  an equal two-column grid.
- "Removed" stays where it means a removed shift, note, membership or device;
  only the staff status changes.
- Never hardcode an org-customizable term; status names are not
  org-customizable.

## Outcome

- **Built as specced**, with these additions found by a source inventory:
  the status-change alert names Away and Archived; the activity log's
  from and to values and its headlines say Marked away, Archived and
  Restored; the Gridmaster status dot and empty states use the names; the web
  bulk bar gained Restore beside Mark active and leaves management-only people
  out of Mark away, as the server already refused them; Gridmaster offers Mark
  away only to someone on the schedule.
- **Evidence:** domain, seats, person actions, People list, Gridmaster,
  reports and mobile tests updated and passing; `npm run type-check`,
  `npm run lint`, `npm run docs:check`; local browser screenshots of the
  person page, both confirmations, Restore, the People tabs with an Archived
  pill, the seat breakdown, and the away banner in dark and light.
- **Not observed:** the mobile screens on a simulator (covered by the mobile
  tests only) and the Gridmaster Employees tab in a browser (covered by its
  tests).
- **Owner, 2026-10-26:** marking someone away should offer an absence type at
  the same time. That is 51f, in the same Mark away confirmation, so 51e and
  51f are to be built next, before 51c.
