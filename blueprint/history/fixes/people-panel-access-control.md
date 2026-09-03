# Access (org role) control on the people slideover and detail page

**Type:** Fix

**Status:** verified

## The problem

`org_role` is the app-login tier for every linked member, `user` included, but
the person-scoped People surfaces treat it as a management-only attribute. The
People table exposes it as its own column literally headed "Access"
(`MembersSection.tsx:1685`, `StaffTableRow.tsx:423-438`), yet opening that same
row loses the control entirely.

1. **Staff slideover has no access control.** `StaffDetailPanel` renders only an
   "Edit Management Access" / "Add to Management" button
   (`apps/web/src/components/staff/StaffDetailPanel.tsx:384-392`) and never
   imports `MemberAccessControls`. Clicking a row whose Access cell just showed
   a dropdown opens a panel where the field vanishes. The data is already in
   scope in the parent: `selectedEmployeeDirectoryPerson`
   (`MembersSection.tsx:946`) is computed and handed to the management modal a
   few blocks later.

2. **Detail page hides access behind a management-user gate.** The only place
   `/people/[id]` renders role is inside a "Management access" card gated on
   `canManageManagementAccess && orgId && (directoryPerson?.isManagementUser ||
hasPendingManagementInvite || isEditingManagementAccess)`
   (`apps/web/src/components/staff-detail/StaffDetailPage.tsx:794-797`). For a
   linked staff member with `org_role: "user"` and no management department the
   whole section is absent, and the profile fields above it (`:757-787`) carry
   no Role/Access field. A super admin cannot see whether that person can log
   in, let alone change it.

3. **Even when it renders, the dropdown is two clicks deep.**
   `MemberAccessControls` only mounts under `isEditingManagementAccess`
   (`StaffDetailPage.tsx:820-830`), so a one-field change drags in the whole
   `EmployeeManagementAccessEditor` (departments, invitation plumbing).

4. **A stale comment marks the intended design that was never built.**
   `ManagementStaffPanel.tsx:450-451` claims the role controls are "shared with
   the on-schedule staff panel". They are not.

Mobile's own helper states the correct principle
(`apps/mobile/src/features/people/lib/orgRoleBadges.ts:26-27`): on a page about
one person the access level is a fact about them, not a list highlight.

## The fix

Treat access as a person-level fact on every person-scoped surface, and leave
the management card owning only what it actually edits (departments and the
invitation plumbing around them). This is wiring plus placement, not new
behavior: `MemberAccessControls`, `roleChangeHandlerFor`, `handleRoleChange`,
and `handlePermissionsChange` all already exist and already carry the
self-guard, optimistic-concurrency `expectedUpdatedAt`, and pending-invitation
"revoke and resend" confirm paths.

No API, permission, or schema changes. The write path stays
`PATCH /api/organizations/access`, still gated on
`isGridmaster || isSuperAdmin` (`app/api/organizations/access/route.ts:77-80`),
matching `canManageManagementAccess` in the UI (`MembersSection.tsx:193`).

Must not break:

- Admins holding `canManageEmployees` still cannot change roles anywhere.
- Self shows a disabled dropdown with the `SELF_ACTION_FORBIDDEN_MESSAGE`
  explanation, never a hidden or editable control.
- The pending-invitation path keeps its "Replace invitation access?" confirm and
  goes through `replaceOrganizationInvitationAccessGuarded`, not a membership
  patch.
- The Permissions launcher stays gated on `orgRole === "admin"` with a real
  `userId`.
- Existing management-access modal and detail-page editor behavior, including
  the unsaved-changes prompt on both.

## Build steps

1. [x] **Share the selected person's access handlers in `MembersSection`.**
       Hoisted the inline `onRoleChange`/`onPermissionsChange` expressions
       previously written directly into the management-access modal's JSX into
       two memoized callbacks (`patchSelectedMembership`,
       `selectedEmployeeRoleChange`, `selectedEmployeePermissionsChange`) keyed
       off `selectedEmployeeDirectoryPerson`. Behavior-preserving refactor.

2. [x] **Render the access control in the staff slideover.**
       `StaffDetailPanel` gained `orgRole`, `onRoleChange`, `pendingInvitationEmail`
       props and rendered the access control in its action area, wired from
       `MembersSection`. Fixed the stale "shared with the on-schedule staff panel"
       comment on `ManagementStaffPanel.tsx` now that it's true.

3. [x] **Lifted access out of the management card on `/people/[id]`.**
       Added a standalone **Access** section to the profile, independent of
       `isManagementUser`. The management card was retitled "Management
       departments" and lost its now-redundant Role field.

## Follow-up refinements (built live, from screenshots during review)

The three steps above landed the control; the rest of the session tuned its
placement and closed gaps the steps didn't anticipate, all against the running
app with screenshots at each turn:

- **Header placement.** The access control moved out of the slideover's action
  row into the header, top-right, next to the person's name and status pill -
  the detail page's placement was approved as-is and left alone.
- **Equal-width action row with icons.** The slideover's bottom row (Send
  Invitation / Add to Management / Deactivate) was rebuilt as equal-width flex
  items, each with a leading icon (`EmployeeStatusActions` gained a `fillWidth`
  prop for this). The panel widened from 480px to 560px to fit comfortably.
  `InlineRoleSelect` replaced `MemberAccessControls` in the header slot, since
  it already handles the read-only-badge and no-access-text cases the row
  needs without a field label crowding the header.
- **Invite-time role picker.** `EmployeeManagementAccessEditor` had a `role`
  state used when creating an invitation, but no UI to set it - a brand-new
  hire being added to management before ever being invited to the schedule had
  no way to choose their eventual role. Added a `CustomSelect` role picker,
  shown only when `!matchedUser` (creating/editing/revoking an invitation);
  existing members keep using `MemberAccessControls`, unchanged.
- **Redundant status row.** The invite-creation path showed both the new Role
  field and an `AccessStatusRow` reading "Management access: No management
  access" - pure noise duplicating the required "Management departments" field
  right below it. Gated `AccessStatusRow` on `hasExistingManagementAccess`.
- **Two flash bugs.** The invite-role picker and the submit button's label
  both keyed off `matchedUser`, which only resolves after
  `fetchOrganizationUsers` completes. For someone who already had a role, this
  showed a second "Role" dropdown and an incorrect "Send Invitation" label for
  one render before flipping to the correct state. Fixed by switching both to
  signals available on first render: `directoryPerson?.orgRole` /
  `Boolean(matchedUser)` for the picker gate, `Boolean(employee.userId)` for
  the label. Two regression tests simulate the pending fetch and assert
  nothing wrong is visible before it resolves.

## Verify

- `npm run type-check` - clean
- `npm run test:web` - 353 files, 2892/2893 tests (the one failure,
  `EditEmployeePanel.test.tsx`'s duplicate-email-check test, is a known-flaky
  test under this session's parallel load; confirmed passing in isolation,
  file untouched by this fix)
- `npm run build` - clean, 11/11 tasks
- Playwright against the running app as `qa-super-admin@dubgrid.test`:
  header placement, equal-width icon row, the cleaned-up management-access
  modal, zero console errors, exactly one "Role" label and a stable "Save
  Access" label on open

## Out of scope

- **Mobile parity.** `PersonDetailScreen` has the same shape: access level
  lives only inside `ManagementAccessSheet`, reachable only via the management
  button, additionally hidden when `isSelf`. Worth its own fix.
- Permission model changes. `canManageManagementAccess = isSuperAdmin ||
isGridmaster` is correct and matches the API.
- The gridmaster `AllUsersView` and `organization-detail/UsersTab` access
  surfaces, which already expose the control correctly.
- A read-only access badge for a `canManageEmployees`-only viewer in the
  slideover (the detail page has this fallback; the slideover's row renders
  nothing for that viewer tier). Flagged during the session, not built.
