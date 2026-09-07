# Feature: Management-only assignment visibility

**From build-plan:** feature 17
**Status:** complete

## Goal

Keep staff editors truthful after a capability transition. A management-only
person must not see schedule assignments or the stale warning that says saving
will remove them from the schedule. A schedule-only person must not retain
management-only settings after management access is removed. The editor may show
the authorized action that restores a capability, but not settings for a
capability the saved record no longer has.

## In scope

- Use the current saved schedule-participation and management-access state to
  select staff-editor sections, rather than retaining a section because a stale
  form draft or cache entry still contains its fields.
- Hide the entire schedule-assignment block, including certification, focus
  areas, roles, and schedule-removal notice, for a management-only person with
  no schedule participation.
- Hide management-only settings after a saved removal from management, while
  preserving the authorized Add to Management action where applicable.
- In the management-only slideover, place the authorized access-role dropdown
  in the header beside the person's identity instead of among the editable
  form settings.
- Ensure save/removal handlers refresh the directory and employee caches before
  the next panel or profile render chooses its sections.
- Keep assignment controls visible while a management user has an _unsaved_
  draft that removes their last focus area, so they can reconsider or restore an
  assignment before saving. Hide those controls only after the server-confirmed
  transition has updated the saved record.
- Apply the same capability rules to the persistent `/people/[id]` editor, the
  self Profile work-details editor, the staff-detail slideover, and the
  management-only slideover. A dual-role person continues to use the
  on-schedule panel path.
- Keep role access in one place: the authorized dropdown belongs in the
  management-only header, while the body keeps only any distinct permissions
  launcher. Pending or view-only states retain their current non-editable access
  presentation.
- On a failed transition, retain the last confirmed capability state and visible
  sections, surface the existing error, and do not optimistically hide controls.
- When a management-access popup removes the final management assignment, close
  or reset that popup after a successful save and return the parent surface to
  the correct schedule-only state. On reopening, it must derive its choices from
  current cached/server data rather than its prior local draft.
- Keep the Add to Schedule popup limited to schedule eligibility: employment,
  focus areas, certification, and schedule roles. Do not duplicate existing name, contact,
  employment, or internal-note editing there.
- Cover both transitions and normal on-schedule/management states with focused
  regression tests.

## Out of scope

- Changing who can add a person to the schedule or management.
- Changing the data model, schedule-assignment semantics, or management role and
  permission rules.
- Redesigning the staff-editor layout or actions beyond hiding inapplicable
  settings and stale notices.

## Build loop

Build one step at a time, show the diff and evidence, and keep every transition
safe to review. `/implement` checks each completed step before moving on.

## Build steps

- [x] **Step 1 - Derive editor sections from saved capabilities** - centralize
      the schedule-participation and management-access predicates used by the
      persistent profile and staff panels. _Done when:_ a management-only record
      with no schedule assignment renders no schedule fields or schedule-removal
      notice, while an on-schedule record still renders the current assignment
      editor.

- [x] **Step 2 - Refresh capability transitions and guard both directions** -
      make schedule-removal and management-removal flows invalidate or update the
      relevant person/directory state before reopening or rerendering an editor;
      place the authorized management-only access dropdown in the slideover header;
      reset completed management-access popups; and add regression coverage for
      both saved transitions. _Done when:_ reopening a management-only record never
      exposes stale schedule settings, reopening a schedule-only record never
      exposes stale management settings, the access dropdown is visible in a
      management-only header only to authorized viewers, unsaved schedule-removal
      drafts remain reversible, completed popups do not retain stale selections, and
      the respective authorized add actions remain available.

- [x] **Step 3 - Focus the Add to Schedule popup** - remove duplicated identity
      and profile fields from the management-only Add to Schedule popup, keeping
      only fields that determine schedule eligibility. _Done when:_ the popup
      preserves its current assignment save behavior while showing only employment,
      focus areas, certification, and roles. Employment is visible
      only while the person is on the schedule.

- [x] **Step 4 - Standardize staff-popup Close actions** - use the shared
      secondary button treatment for Close actions in the staff-add and Add to
      Schedule dialogs. _Done when:_ a gray filled ghost Close button does not
      appear beside a primary save/add action in either dialog.

## Files / areas

- `apps/web/src/components/EditEmployeePanel.tsx`
- `apps/web/src/components/staff/StaffDetailPanel.tsx`
- `apps/web/src/components/staff/ManagementStaffPanel.tsx`
- `apps/web/src/components/staff/MembersSection.tsx`
- `apps/web/src/components/account/ProfilePanel.tsx`
- `apps/web/src/components/staff-detail/StaffDetailPage.tsx`
- `apps/web/src/components/staff/EmployeeManagementAccessModal.tsx`
- `apps/web/src/components/staff/AddManagementUserToScheduleModal.tsx`
- Existing focused people and editor tests under `apps/web/src/__tests__/` and
  `apps/web/src/components/staff/__tests__/`

## Data / contracts

- No schema or API contract change. The visible section contract derives from
  existing saved employee focus-area assignments and saved management membership
  department assignments.
- The schedule and management caches must agree before selecting a panel path;
  do not infer capability from unsaved form state.

## Testing

- Add focused rendering tests for management-only, schedule-only, and dual-role
  records, including absence of the exact stale schedule-removal alert.
- Add a management-only slideover test that asserts the authorized access
  dropdown is in the header and is absent from the body.
- Add transition tests for remove-from-schedule and remove-from-management cache
  refreshes and their reopened panel paths, including a failed mutation and an
  unsaved removal draft.
- Add coverage for the self Profile and `/people/[id]` work-details editors, and
  for a completed management-access popup reopening from fresh capability data.
- Add focused popup coverage for the absence of duplicated profile fields and
  preservation of schedule-assignment submission.
- Run focused people/editor tests, `npm run type-check`, `npm run test:web`,
  `npm run lint`, and `npm run build`.
- Manually use Arden Wood to remove a scheduled management user from the
  schedule, save, reopen them, and confirm the Assignments section is absent;
  repeat the inverse management removal and confirm no management settings
  remain. Do not alter unrelated records.

## Notes for the AI

- The red banner in the supplied screenshot is a consequence warning, not a
  validation error. It must disappear with the schedule-assignment section once
  the saved state is management-only.
- Respect current authorization, confirmations, pending states, terminology,
  and browser zoom. Do not hide the action that is intentionally used to add a
  person back to a capability.
