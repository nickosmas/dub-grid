# Feature: Gridmaster grants with step-up

**From build-plan:** feature 41d4
**Status:** in progress

## Goal

A Gridmaster can invite someone as Super Admin, and every grant a Gridmaster
makes asks for fresh proof through the step-up prompt instead of failing.
Today the server allows a Gridmaster Super Admin invitation, but no screen
offers it: the Gridmaster portal's Add form offers User and Admin and only
assigns existing accounts, the setup wizard's invitation step offers User and
Admin, and the People management editor hard-codes User and Admin. The same
grants run on the Gridmaster session alone (F-55, F-59), and the People
screens show an error instead of a prompt when the access route asks for
proof (F-58).

## In scope

- **Invitation routes gate a Gridmaster.** Invitation create, edit (a role or
  email change) and access replacement call `requireSensitiveActionAuth`
  when the caller is a Gridmaster, before any write. `INVITATION_TIER_DENIED`
  answers 403 with a clear message instead of a generic 500. Raising an
  invitation's role records the editor as its inviter, so acceptance checks
  the person who granted it.
- **Gridmaster portal invites.** The Users tab's Add form offers User, Admin
  and Super Admin. An existing account is assigned as today; an address with
  no account gets an invitation email. Both run through step-up.
- **Setup wizard.** The invitation step offers Super Admin. The server's
  Super Admin grant in `createOrganizationSetup` requires fresh proof, and
  the wizard saves through step-up (F-55).
- **People screens.** The management editor offers Super Admin to a caller
  who can grant it (a Super Admin or a Gridmaster), as the invite modal
  already does. A Gridmaster's role changes and invitations from People run
  through step-up (F-58).
- **Smaller grant gaps (F-61).** Remove the unused browser-side
  `assignOrgRoleByEmail` helper; a Gridmaster's permission-only change on the
  access route requires fresh proof like a role change.
- **Inventory.** The sensitive-action marker also matches `send_invitation`
  and `replace_pending_invitation_access`; each newly matched route is
  classified, and the inventory fails if a gate is removed.

## Out of scope

- Direct database writes by a Gridmaster token (F-60) stay a decision.
- Impersonation keeps showing the impersonated person's permissions, so the
  invite modal offers Super Admin under impersonation only when that person
  could grant it.
- Mobile: it refuses Gridmaster tokens outright.

## Build loop

Each step is implemented, verified and self-reviewed on `dev`, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - invitation routes gate a Gridmaster** - create, edit and
      replace-access require fresh proof for a Gridmaster; tier denial maps to
      403; a role raise records the editor as inviter. _Done when:_ route tests
      prove a stale Gridmaster session writes nothing on each path, a fresh
      one succeeds, a non-Gridmaster admin is unaffected, and tier denial
      returns 403. The inventory marker and both routes' classification
      landed here, since the inventory test requires them as soon as a route
      calls the gate; 8 new route tests fail against the previous code.
- [x] **Step 2 - Gridmaster portal invites a Super Admin** - the manage
      route's `assignOrgRoleByEmail` answers `404 ACCOUNT_NOT_FOUND` for an
      address with no account; the Users tab's Add form offers Super Admin and
      sends an invitation when there is no account, all through step-up.
      _Done when:_ route and view tests cover assign, invite-on-no-account,
      Super Admin, and the step-up path.
- [x] **Step 3 - setup wizard** - Super Admin in the invitation step; the
      server's Super Admin grant gated; the wizard saves through step-up.
      _Done when:_ route tests prove a stale session grants nothing and the
      persistence runs its calls with the assured token.
- [x] **Step 4 - People screens** - the management editor offers Super Admin
      to a caller who can grant it; a Gridmaster's People role changes and
      invitations run through step-up. _Done when:_ view tests show the
      option only for a Super Admin or Gridmaster and the step-up path.
      The People screens run each grant inside step-up without the
      credential preflight, so only the server's explicit request for a
      Gridmaster prompts; the role controls that own the confirmation
      (`InlineRoleSelect`, `MemberAccessControls`) own the step-up too.
- [x] **Step 5 - F-61 and the inventory** - dead helper removed, permission
      changes gated for a Gridmaster, inventory marker extended and routes
      classified. _Done when:_ the inventory test passes and fails if an
      invitation route loses its gate.

## Files / areas

- `apps/web/src/app/api/organizations/invitations/create/route.ts`,
  `apps/web/src/app/api/organizations/invitations/route.ts`,
  `apps/web/src/app/api/gridmaster/organizations/manage/route.ts`,
  `apps/web/src/app/api/organizations/access/route.ts` and their tests.
- `apps/web/src/components/gridmaster/organization-detail/UsersTab.tsx`,
  `apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx`,
  `apps/web/src/components/gridmaster/organization-setup/persistence.ts`.
- `apps/web/src/components/staff/EmployeeManagementAccessModal.tsx`,
  `MembersSection.tsx`, `staff-detail/StaffDetailPage.tsx`, `ProfilePanel.tsx`.
- `apps/web/src/features/organization/client/access.ts`,
  `apps/web/src/features/gridmaster/client/api.ts`, `apps/web/src/lib/db/`.
- `apps/web/src/__tests__/sensitive-action-authorization-boundaries.test.ts`.

## Data / contracts

- No schema change. Gated routes return the standard `STEP_UP_REQUIRED` 403.
- `assignOrgRoleByEmail` on the manage route: `404 { code: "ACCOUNT_NOT_FOUND" }`
  when the address has no account (Gridmaster only, so no disclosure beyond
  what the portal already shows).
- Client helpers that call a gated route take an optional `accessToken` and
  throw errors carrying `status`, `code` and `method` so step-up recognizes
  them.

## Testing

- Route tests per gated path, view tests for the Users tab, the wizard's
  persistence and the management editor, and the inventory test.

## Notes for the AI

- Follow the F-16 pattern: the session check, then `requireSensitiveActionAuth`
  only for a Gridmaster; the client runs `requireCredentialAssurance` inside
  `stepUp.run` and passes the assured token.
- Confirmations hide while the step-up dialog shows.
- No em dashes.
