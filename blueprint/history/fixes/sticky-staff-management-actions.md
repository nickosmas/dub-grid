# Sticky staff management actions and organization-invariant behavior

**Type:** Fix

**Status:** verified

## The problem

The editable staff slideover does not keep person-level actions such as Add to
Management and Deactivate attached to the editor footer. They currently sit at
the end of the scrollable form, so short forms leave a large blank gap below
them and long forms require scrolling to find them. The user expects these
actions in a dedicated sticky section immediately above the existing sticky
Close and Save section.

The reported Calm Haven and Arden Wood font-size and width difference was traced
to different browser zoom levels, not organization-specific product styling.
Browsers can retain zoom separately for each organization subdomain. The app
must respect that user-controlled accessibility setting rather than trying to
reset or counter-scale it. At the same viewport and zoom, organization identity
and organization data must never change the component, layout, typography,
interaction, responsive behavior, loading/error treatment, or accessibility
contract.

## The fix

Move all available person-level management, invitation, permission, and
employment-status actions into a separate non-scrolling action bar directly
above the editor's Close and Save bar. Keep the two bars visually distinct but
attached, preserve the existing action order, responsive wrapping, loading and
disabled states, confirmations, sandbox restrictions, and unsaved-change
behavior. Do not change permissions or expose an action to a role that cannot
currently use it.

Keep the current staff-panel geometry and semantic type scale. Verify that the
same record path renders identically across organization ids at the same zoom,
without overriding browser zoom. Tenant-specific data, terminology,
permissions, branding, and enabled features may change what content or
authorized actions appear; they must not create a lower-quality or structurally
different experience.

## Build steps

- [x] **1. Add the sticky person-action bar**
  - Remove person-level actions from the scrollable form and render them in a
    dedicated fixed footer section immediately above Close and Save.
  - Include whichever invitation, management-access, permissions, and
    employment-status actions the current viewer and record are allowed to see.
  - Keep the action section compact, allow safe responsive wrapping, and ensure
    both footer sections remain reachable without covering form content.
  - Done when Add/Edit Management Access, Send Invitation, Manage permissions,
    Deactivate/Activate/Remove, and their applicable variants stay visible above
    Close and Save without changing authorization or mutation behavior.

- [x] **2. Guard organization-invariant presentation and verify the result**
  - Trace every conditional that selects a staff slideover path and ensure it is
    based only on the person state and authorized capability, never the
    organization identity.
  - Add a regression fixture that renders equivalent records under distinct
    organization ids and terminology values and proves the same structural and
    semantic presentation contract.
  - Add focused structural tests for action-bar placement outside the scroll
    region, conditional action visibility, and mobile wrapping behavior.
  - Compare representative editable scheduled, management-only, and pending
    records in both organizations at identical desktop and mobile viewports and
    100% browser zoom. Then check 125% and 200% zoom for reflow and reachability
    without modifying the user's zoom setting in product code.
  - Done when tenant differences affect only authorized content and settings;
    component choice, geometry, typography, interaction, responsive behavior,
    loading/errors, and accessibility remain identical; and both sticky
    sections remain reachable without obscuring content.

## Verify

- In Calm Haven and Arden Wood, open equivalent staff records at the same
  viewport and 100% browser zoom. Confirm the panel width and typography match.
- Scroll from the top to the bottom of short and long forms. Confirm the
  person-action bar remains directly above Close and Save and neither bar covers
  editable content.
- Exercise each available invitation, management-access, permissions, and
  employment-status action. Confirm existing dialogs, pending states, errors,
  sandbox restrictions, and permissions are unchanged.
- Check scheduled staff, management-only people, pending invitations, inactive
  people, long organization terminology, narrow desktop, mobile, 125% zoom, and
  200% zoom.
- Render equivalent records with different organization ids and confirm the
  same component structure, styles, interactions, loading/error states, and
  accessible names; only configured terminology, data, branding, permissions,
  and feature availability may differ.
- Run focused staff-panel tests, `npm run type-check`, `npm run test:web`,
  `npm run lint`, and `npm run build`.
