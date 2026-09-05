# Current Feature

**Title:** Own profile page management access: entry point and popup consistency

**Type:** Fix

**Status:** verified

## The problem

`/profile`'s Access card (`apps/web/src/components/account/ProfilePanel.tsx`)
had two related bugs, found live while testing the People-page access-control
fix (`83b8e562`) against a real account:

1. **No entry point from zero departments.** The whole management-access
   section was gated on `showManagementAccess = managementDepartmentIds.length

   > 0`. A super_admin/gridmaster viewing their own profile with zero current
   > management departments saw nothing at all - no Role, no "Add to
   > Management," nothing. The only edit affordance ("Edit management access")
   > only ever appeared once you were already in management, so there was no way
   > to get started.

2. **Inconsistent with every other access surface.** Unlike the People
   directory panels (`StaffDetailPanel`, `StaffDetailPage`,
   `ManagementStaffPanel`), which all edit management access through the
   shared `EmployeeManagementAccessEditor` inside a `<Modal>` popup,
   `ProfilePanel` had its own bespoke inline UI: local `isEditingAccess` state,
   raw `SelectableTag` department toggles, and a direct
   `updateAppOnlyUser(...)` call. Different look, different code path, no
   Role/permissions editing via `MemberAccessControls` at all.

## The fix

Bring `/profile`'s Access section in line with the People panels: same
components, same popup pattern, entry point available regardless of current
department count.

- Gate the section on `canManageManagementAccess || showManagementAccess`
  (not `showManagementAccess` alone), and always show Role - matching the
  "access is a fact about the person" principle from the People-panel fix.
- Split into two cards, matching `StaffDetailPage`: **Access** (Role +
  permissions via `MemberAccessControls`) and **Management departments**
  (department summary + Edit/Add button).
- The Edit/Add button opens `EmployeeManagementAccessEditor` in a `<Modal>`,
  the same shared component and popup pattern used everywhere else, instead of
  the bespoke inline toggle-tag form.
- Remove the now-superseded local state and handlers (`isEditingAccess`,
  `editDeptIds`, `savingAccess`, `toggleAccessDepartment`, `accessHasChanges`,
  `accessWouldOrphan`, `saveAccessChanges`).

Must not break:

- Self can never change their own role - `MemberAccessControls`'s own
  `isSelf` branch renders the disabled dropdown with
  `SELF_ACTION_FORBIDDEN_MESSAGE`; this fix passes real handlers (matching
  every other caller) and relies on that existing component-level guard, not a
  new one.
- The org-wide `fetchOrganizationUsers` endpoint 403s for anyone who isn't
  super_admin/gridmaster, so any new fetch this fix adds must stay gated
  behind `canManageManagementAccess`.
- The existing "Add to Schedule" affordance and its gating
  (`canAddToSchedule`).
- `Work details` (`EditEmployeePanel`) and the account-details Save/Discard
  flow above it, both unrelated to this card.

## Build steps

1. [x] **Split into Access + Management departments cards, backed by the
       shared components.** In `ProfilePanel.tsx`:
   - Replace the single `showManagementAccess`-gated card with two:
     **Access** (always rendered; `MemberAccessControls` when
     `canManageManagementAccess`, else a read-only Role `Field`) and
     **Management departments** (rendered when `canManageManagementAccess ||
showManagementAccess`; department summary + Edit/Add button).
   - The button opens `EmployeeManagementAccessEditor` inside a `<Modal>`,
     wired with the same `useUnsavedChangesPrompt` guard `StaffDetailPage`
     uses. Its `directoryPerson` prop is built from data already on hand
     (`employee`, `user`, `role`, `managementDepartmentIds`), since the editor
     re-fetches the authoritative membership internally for the actual save.
   - Add a `canManageManagementAccess`-gated `fetchOrganizationUsers` lookup
     for the caller's own membership, so `MemberAccessControls`'s permissions
     launcher (not self-gated, so a self-admin can genuinely reach it) has a
     real `adminPermissions` and `expectedUpdatedAt` instead of no-op'ing.
   - `handleRoleChange`/`handlePermissionsChange` follow the same
     `updateOrganizationMembershipGuarded` pattern as
     `StaffDetailPage`'s.
   - Remove the superseded local state/handlers and their now-unused imports
     (`SelectableTag`, `updateAppOnlyUser`).
   - `onCompleted` calls a new `refetchProfile` prop (threading through
     `useSelfProfileData`'s existing `refetch`, via `ProfilePage.tsx`) since
     the shared editor doesn't hand back the new department list directly.
   - Tests added to `ProfilePanel.test.tsx`: Role always visible with no
     management involvement; "Add to Management" offered at zero departments
     for an authorized viewer; the button opens the shared editor in a popup
     (not inline) and `onCompleted` triggers `refetchProfile`; "Edit
     management access" instead of "Add to Management" once departments
     exist; the whole card absent for a viewer with neither departments nor
     permission.
     Done when: `npx tsc --noEmit` is clean; `ProfilePanel.test.tsx` passes; a
     super_admin/gridmaster viewing their own profile with zero departments
     sees an "Add to Management" button that opens the same popup used on
     `/people/[id]`, and an existing management member sees "Edit management
     access" opening the same popup pre-filled with their current departments.

## Verify

- `npx tsc --noEmit -p apps/web/tsconfig.json`
- `npx vitest run --root apps/web src/components/account/ProfilePanel.test.tsx src/components/profile`
- `npm run build`
- Manual as `qa-super-admin@dubgrid.test` (never a personal login): open
  `/profile`, confirm the Access card shows Role (disabled dropdown, self
  explanation) and the Management departments card's "Edit management access"
  opens the same popup style used on the People pages; confirm no console
  errors.

## Out of scope

- Role changes for self remain impossible everywhere in the app (by design);
  this fix doesn't touch that guard, only makes the read/edit-departments
  surface consistent with the rest of the app.
- Any change to `fetchOrganizationUsers`'s permission gate or to
  `EmployeeManagementAccessEditor` itself - both are reused as-is.
