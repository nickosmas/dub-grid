# Feature: Manager person detail completeness

**From build-plan:** feature 43a
**Status:** verified

## Goal

A manager who opens a person on the People page sees every fact about them
that they are allowed to see, on the Profile section that opens first. Today
the date joined is missing from the page entirely (the single-person fetch
never attaches it), the date added, status history and account state sit only
on the Overview tab, last active is never shown, the invitation banner gives
no dates, and an expired invitation reads as "Not invited yet" with no way to
reinvite. Admins who manage employees also cannot see someone's management
departments, which they already see in the Management list.

## In scope

- **Date joined on the detail page.** The `fetchEmployeeById` action returns
  `joinedAt` for detail viewers, read from that one person's membership.
  View-only callers keep today's masking (their own row only). Saves, status
  changes and conflict swap-ins on the page keep the known joined date, as the
  People table already does.
- **A Record card on Profile.** One card, below Work details, showing: date
  added, date joined ("Not joined" when there is no account), status with the
  date it last changed and its note, account state, and last active. The
  Overview tab's Account and Employment status cards and its "Date added" line
  move here rather than being duplicated.
- **Account state from one helper.** Linked, invitation pending, invitation
  expired, not invited, or no email, derived by one pure function that also
  re-derives on a one-minute tick so an invitation that expires while the page
  is open stops reading as pending.
- **Invitation banner dates.** The pending banner shows when it was sent and
  when it expires.
- **Expired invitations.** An expired invitation that was neither accepted nor
  revoked shows an expired banner with Reinvite (the resend route already
  rotates an expired row) and Revoke, and "Send invitation" is hidden while it
  exists, so one click never leaves two invitations.
- **Management departments for staff managers.** The Management departments
  card shows read-only to anyone with manage-employees; its Edit access button
  stays with Super Admins and Gridmasters.

## Out of scope

- Mobile: the person screen and its contract are unchanged (decided
  2026-09-26).
- The Gridmaster person page and everything in 43b to 43e.
- The Management list panel, which also hides Reinvite for an expired
  invitation: noted, not changed here.
- Date formatting stays the page's current locale formatting; no organization
  time zone change.

## Build loop

Each step is implemented, verified and self-reviewed on `dev`, then committed
as a local checkpoint.

## Build steps

- [x] **Step 1 - joined date reaches the detail page** - `fetchEmployeeById`
      attaches `joinedAt` from the person's membership (one query by
      `org_id` and `user_id`, null without a linked account) for detail
      viewers; the view-only path is unchanged. Export the table's
      known-joined-date merge from `hooks/employee-rows.ts` and use it wherever
      the page replaces its employee after a save, status change or conflict.
      _Done when:_ route tests show a detail viewer gets the date, an unlinked
      person gets null and a view-only caller gets null for someone else; the
      list helper keeps a row's date through a save response (the on-screen
      check moves to Step 3, where the date first renders).
- [x] **Step 2 - account state helper** - a pure function in `lib/` takes the
      employee's `userId` and `email`, their invitations and the current time,
      and returns linked, pending (email, sent, expires), expired (email,
      sent, expired), not invited, or no email. Accepted and revoked
      invitations never count; the newest open invitation wins. _Done when:_
      unit tests cover each state, an invitation crossing its expiry, and a
      revoked invitation beside an expired one.
- [x] **Step 3 - Record card on Profile** - the card shows date added, date
      joined, status (label, since, note), account state from Step 2, and last
      active from the directory (the row is omitted when the directory carries
      no value). The page derives invitation state on a one-minute tick. The
      Overview tab drops its Account and Employment cards and its Date added
      line. _Done when:_ page tests show each field for a linked person, "Not
      joined" and "Not invited" for an unlinked one, and "No email" when there
      is no address; a save keeps the date joined on screen; the Overview test
      no longer expects the moved fields. _Built:_ the Overview tab is shared
      with the signed-in person's own `/profile`, so that page shows the same
      Record card (account linked, no last active), keeping the date added and
      status it showed before; a joined date that was not loaded is left out
      rather than read as "Not joined".
- [x] **Step 4 - invitation dates and expired invitations** - the pending
      banner shows sent and expiry dates; an expired open invitation shows an
      expired banner with Reinvite and Revoke to staff managers, and hides
      "Send invitation" while it exists. _Done when:_ view tests show both
      banners' dates, Reinvite on an expired invitation calls resend with its
      id, and no "Send invitation" button renders beside an expired
      invitation. _Built:_ the banner is shared, so the People slide-over and the
      edit panel show the dates too.
- [x] **Step 5 - management departments for staff managers** - the card
      renders for a caller with manage-employees when the person is a
      management user or has a pending management invitation; Edit access
      renders only for Super Admins and Gridmasters. _Done when:_ page tests
      show the card without Edit access for an Admin, with it for a Super
      Admin, and no card for a caller without manage-employees.

## Files / areas

- `apps/web/src/app/api/employees/manage/route.ts` and `route.test.ts`.
- `apps/web/src/hooks/employee-rows.ts` and its test.
- `apps/web/src/lib/person-account-state.ts` (new) and its test.
- `apps/web/src/components/staff-detail/StaffDetailPage.tsx` and its test.
- `apps/web/src/components/staff-detail/tabs/OverviewTab.tsx` and
  `apps/web/src/__tests__/OverviewTab.test.tsx`.
- `apps/web/src/components/staff/PendingInvitationBanner.tsx`.

## Data / contracts

- No schema change and no new route.
- `fetchEmployeeById` responses now carry `joinedAt` (string or null) for
  detail viewers; `Employee.joinedAt` already exists. View-only responses keep
  `joinedAt: null` except on the caller's own row.
- Account state (load-bearing for 43b's organization cards, which can reuse
  it): `{ kind: "linked" } | { kind: "pending" | "expired"; invitationId; email;
sentAt; expiresAt } | { kind: "not-invited" } | { kind: "no-email" }`.

## Testing

- Route tests for Step 1, unit tests for Step 2, and page or view tests for
  Steps 3 to 5, following `StaffDetailPage.test.tsx`.
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- The directory already limits `lastSignInAt` to staff managers, Super Admins
  and Gridmasters; the page must not widen that.
- Organization terminology comes from settings; no hard-coded labels.
- Confirmations are dialogs (the banner's existing Reinvite and Revoke
  confirms stay).
- Operational dates use `dg-tabular-nums`.
- No em dashes.
