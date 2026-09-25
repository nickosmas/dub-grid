# Feature: Joined date means acceptance

**From build-plan:** feature 41a4
**Status:** verified

## Goal

"Date joined" should mean the day a person joined the organization, which is
when they accepted their invitation. Today the People table's "Date Joined"
column prints when the staff record was created, and the mobile profile's
"Joined" line prints when the sign-in account was created. Neither is the day
the person joined. Show the real joined date, call the record's creation date
"Date added", and show no joined date for anyone who has not joined.

## In scope

- **The People table's date column shows "Date joined".** It reads the
  person's organization membership `joined_at`, and shows the existing empty
  mark for someone with no account or an invitation still pending. Both
  table variants (the grid and the table) change together.
- **"Date added" moves to the person's detail view.** The staff record's
  creation date appears as a "Date added" row in the Details card on the
  full detail page (the Overview tab, which a person's own work profile also
  renders).
- **The People list carries the joined date, and keeps it across saves.** The
  list fetch attaches it on the server. A save, a status change or a version
  conflict replaces the row with a single-employee response that has no
  joined date; the client keeps the one it already had, unless the row's
  account link changed, so the column never blanks while a refetch is in
  flight.
- **View-only callers do not learn who has an account.** The list already
  hides the account link from view-only callers; the joined date is hidden the
  same way, except on the caller's own row.
- **The mobile profile's "Joined" line** shows when this account joined the
  organization it is signed in to, not when the account was created, and is
  omitted when there is no membership (a Gridmaster).

## Out of scope

- **Sorting or filtering by either date.** Neither is sortable today.
- **The Gridmaster views.** `AllUsersView` already reads membership
  `joined_at`; `GridmasterAccountsView` lists platform accounts that belong to
  no organization.
- **The staff detail slideover.** It is an editing panel with no read-only
  field list; the full detail page carries "Date added".
- **Mobile People screens.** They show neither date today.
- **Any schema change.** `organization_memberships.joined_at` already holds
  the acceptance time (see Data / contracts).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - the joined date on the People list** - add optional
      `joinedAt` to the shared `Employee` type, and in `/api/employees/manage`
      `fetchEmployees` read the organization's memberships in pages (by
      `org_id`, never an unbounded `in()` list) and attach `joined_at` by
      `user_id`. Mask it to null for view-only callers except on their own
      row. _Done when:_ route tests prove a linked employee carries its
      membership's `joined_at`, an unlinked or pending one carries null, the
      membership read is scoped to the employee query's organization, and a
      view-only caller sees null on a coworker and the date on their own row.
- [x] **Step 2 - saves keep the joined date** - one pure helper that replaces
      a list row with a single-employee response, keeping the previous
      `joinedAt` when the response has none and the `userId` is unchanged,
      used at every row replacement in `useEmployees` (save, save with
      reinvite, remove, deactivate, activate, and the conflict swap-ins).
      _Done when:_ helper tests cover a kept date, a changed account link
      (dropped), and a response that carries its own date (used as is), and a
      grep shows no remaining direct row replacement in the hook.
- [x] **Step 3 - the People table column** - the column reads `joinedAt`, is
      headed "Date joined" in both variants (the grid header's "Date Joined"
      capitalization is corrected to match), and shows the empty mark when
      there is none. Correct the `createdAt` doc comment and the CSS comment
      that still describe the old meaning. _Done when:_ a render test shows
      the joined date for a linked person and the empty mark for an unlinked
      one, and a Playwright screenshot of the People table at desktop width
      shows the column with no console errors.
- [x] **Step 4 - "Date added" in the detail view** - a "Date added" row in the
      Overview tab's Details card, from `createdAt`, omitted when it is
      absent. _Done when:_ a render test shows the row and its absence, and a
      screenshot of a person's detail page shows it.
- [x] **Step 5 - the mobile profile's joined line** - carry `joinedAt` on the
      resolved mobile membership, return it as a top-level `joinedAt` on the
      profile response (additive, defaulting to null so older servers and app
      builds keep parsing), and render "Joined {date}" from it, omitting the
      line when it is null. _Done when:_ contract, profile route and screen
      tests cover a member (the membership date, not the account date) and a
      caller with no membership (no line).

## Files / areas

- `packages/domain/src/staff.ts` - `Employee.joinedAt`, and the corrected
  `createdAt` comment.
- `apps/web/src/app/api/employees/manage/route.ts` and its test.
- `apps/web/src/hooks/useEmployees.ts`, with the row-replacement helper and
  its test beside it.
- `apps/web/src/components/staff/StaffTableRow.tsx`,
  `apps/web/src/components/staff/MembersSection.tsx`,
  `apps/web/src/app/app-ui.css` (comment only).
- `apps/web/src/components/staff-detail/tabs/OverviewTab.tsx`.
- `packages/mobile-api-core/src/auth.ts`,
  `apps/web/src/features/mobile/server/routes/profile.ts`,
  `packages/contracts/src/mobile.ts`,
  `apps/mobile/src/features/profile/screens/ProfileScreen.tsx`, and their tests.

## Data / contracts

- **`organization_memberships.joined_at` is the acceptance time.** It
  defaults to `now()` on insert. `accept_invitation` (restated in 033) inserts
  the membership as it marks the invitation accepted, and refuses when any
  membership for that person and organization already exists, archived or
  not. No migration touches `joined_at` after 001. A membership made another
  way (a direct role assignment to an existing account) records the day of
  that assignment, which is also when that person joined.
- **An archived membership keeps its joined date.** The person did join; a
  later loss of access does not unmake that.
- **`Employee.joinedAt?: string | null`** (ISO timestamp). Load-bearing: the
  People table reads it. Null when the employee has no linked account or no
  membership in this organization.
- **`mobileProfileResponseSchema` gains `joinedAt: string | null`**, defaulting
  to null. Additive: `user.createdAt` stays for existing app builds.

## Testing

Vitest and Playwright are configured, so the testing gate is on.

- **Logic needing tests:** the list fetch's matching, org scoping and
  masking; the row-replacement helper; the profile route and contract; and
  the mobile line's presence rule.
- **Render tests:** the table cell and the Details row, which are small
  enough to assert directly.
- **Browser evidence:** Playwright screenshots of the People table and a
  detail page, logged in as `qa-super-admin@dubgrid.test` against the
  worktree's own dev server, with no console errors.
- **Manual try:** on People, a person who has accepted shows a date, one with
  a pending invitation or no account shows the empty mark; their detail page
  shows "Date added". On mobile, the profile's "Joined" date matches the web
  table's date for the same person.

## Notes for the AI

- Read memberships with the same organization id the employee query uses;
  never trust a client-supplied org id beyond what the existing
  permission check has already validated.
- `db.max_rows` caps every read, so page the membership read the way
  `fetchAllRows` pages the employee read.
- Keep the empty-mark and date formatting the cell already uses.
- "Date joined" and "Date added" are not organization-configurable terms.
- No em dashes in copy, comments or commits. The table's empty mark is the
  existing glyph, not new prose.
- An acceptance elsewhere reaches an open People page without new wiring:
  acceptance sets the employee's `user_id`, the employees realtime channel
  invalidates the list, and the refetch brings the joined date.
- The mobile profile skeleton reserves the "Joined" line. For the rare caller
  with no membership the line is omitted once loaded, a small shift that is
  acceptable; do not add a placeholder.
