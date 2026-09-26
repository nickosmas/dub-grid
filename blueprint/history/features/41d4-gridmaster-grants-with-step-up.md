# Feature: Gridmaster grants with step-up

**From build-plan:** feature 41d4
**Status:** verified

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

- [x] **Repair F-63 and F-59 (audit of e42da4bd..821c7ff4)** - an email
      change checks the editor can grant the invitation's role; resend and
      access replacement no longer return the token; the Gridmaster check
      fails closed; access replacement asks before the send limit; the
      unused `sendInvitation` helper is gone; a cancelled reinvite says so
      and the management editor revokes after the role change (F-63 to
      F-67). _Done when:_ route tests prove an Admin's redirect is refused
      and no token is returned, and they and the inventory fail against the
      previous code.

- [x] **Repair F-70 (re-review of 4de3f7d4)** - migration 049 takes the
      `invitations` table privilege from `authenticated` and regrants reading
      every column but the token. _Done when:_ the static SQL test and the
      live isolation test pass, and a direct read of the token as
      `authenticated` is refused on the local stack. Production needs 049
      before the release that carries 41d4.

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

## Findings

### 41d4/F-55 [P3] closed - The organization-setup wizard assigns Super Admin without fresh proof

**File:** `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:445`
**Found:** 2026-09-25 by `/audit` of a6e3c15c
**Why it matters:** `createOrganizationSetup` calls `assign_org_role_by_email` with `super_admin` on the Gridmaster session alone. The organization is brand new and empty, so the reach is small.
**Suggested fix:** Gate the setup when a Super Admin email is given, with step-up in the wizard, or record the exemption.
**Resolution:** Fixed in 41d4 (Step 3): `createOrganizationSetup` requires `requireSensitiveActionAuth` before creating anything when it names a Super Admin, the wizard runs it through step-up with the credential preflight, and the inventory pins the gate. Route tests prove a stale session creates no organization. Re-review (e42da4bd..821c7ff4): closed; setup is gated before anything is created whenever it names a Super Admin.

### 41d4/F-58 [P3] closed - An impersonating Gridmaster's role change in People fails without a step-up prompt

**File:** `apps/web/src/components/staff/MembersSection.tsx:692`; `StaffDetailPage.tsx:700`; `EmployeeManagementAccessModal.tsx:247`; `ProfilePanel.tsx:325`
**Found:** 2026-09-25 by `/audit` re-review of d6b802ca
**Why it matters:** Impersonation uses the Gridmaster's own token, so the access route's Gridmaster gate applies, but these screens do not run through step-up: a stale session sees an error toast instead of a prompt. It fails safe.
**Suggested fix:** Run those calls through `useStepUpAction` with the credential preflight.
**Resolution:** Fixed in 41d4 (Step 4): every People grant (role and permission changes, invitation create, edit and access replacement) runs inside step-up without the preflight, so only the server's request for a Gridmaster prompts; the role controls that own the confirmation own the step-up and hide it while the prompt shows. View tests cover the token and cancel paths. Re-review (e42da4bd..821c7ff4): closed; every People grant path runs through step-up. Its two follow-ups (a silent cancelled reinvite, a revoke before the prompt) are F-65.

### 41d4/F-59 [P2] closed - A Gridmaster can grant Super Admin through invitations without fresh proof

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:225`; `apps/web/src/app/api/organizations/invitations/route.ts:307`, `:604`; `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:457`
**Found:** 2026-09-25 by `/audit` re-review of 7ba79e75
**Why it matters:** A Gridmaster passes `canManageEmployees` and `canAssignOrgRole`, so it can invite an address it controls as Super Admin to any organization, or redirect a pending invitation's role and email, and the invitee registers pre-confirmed: the F-16 outcome by another door.
**Suggested fix:** Require fresh proof for a Gridmaster (or for any Super Admin grant) on invitation create, update and reissue, with step-up in the invitation UI; add `send_invitation` and `replace_pending_invitation_access` to the inventory marker.
**Resolution:** Fixed in 41d4 (Steps 1-4): invitation create, a role or email edit, and access replacement require fresh proof for a Gridmaster before any write; a role raise records the editor as inviter; `INVITATION_TIER_DENIED` answers 403; the inventory marker includes `send_invitation` and `replace_pending_invitation_access`. Invitation UIs prompt instead of failing. Re-review (e42da4bd..821c7ff4) kept it open: resend (and access replacement) returned the new token to the caller, so a stale Gridmaster session could resend any pending Super Admin invitation and read its token. Neither response carries the token now, the client no longer expects one, and a route test plus the inventory fail if it returns. Re-review (821c7ff4..4de3f7d4): closed; no route or handler returns a token.

### 41d4/F-61 [P3] closed - Two smaller role-grant gaps

**File:** `apps/web/src/lib/db/organizations.ts:391`; `apps/web/src/app/api/organizations/access/route.ts:335`
**Found:** 2026-09-25 by `/audit` re-review of 7ba79e75
**Why it matters:** `assignOrgRoleByEmail` in `lib/db` calls the RPC from the browser client; it has no callers but is still exported, inviting an ungated path back. A Gridmaster's permission-only change on the access route runs without fresh proof (a smaller grant: an Admin still cannot assign Admin or Super Admin).
**Suggested fix:** Remove the dead helper; gate a Gridmaster's permission changes like role changes.
**Resolution:** Fixed in 41d4 (Step 5): the unused browser-side `assignOrgRoleByEmail` is removed, and a Gridmaster's permission-only change on the access route requires fresh proof like a role change; the portal's permission editor runs through step-up and the review hides while the prompt shows. Re-review (e42da4bd..821c7ff4): closed; the helper is gone with no references and the permission-only gate precedes any write. The other unused browser grant helper is F-67.

### 41d4/F-63 [P1] closed - An Admin could redirect a pending Super Admin invitation to an address they control

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:310`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4 (predates 41d4)
**Why it matters:** The tier check ran only when the role was sent, so an email-only edit kept `super_admin` and the original Super Admin inviter; resend then returned the token, and registration plus acceptance made the Admin's address a Super Admin.
**Suggested fix:** Check `canAssignOrgRole` for the invitation's role whenever the email changes.
**Resolution:** An email change now requires the editor to be able to grant the invitation's role (the requested one, or its current one), before any write; a route test proves an Admin's redirect of a Super Admin invitation is refused and writes nothing. The token is also no longer returned (F-59). Re-review (821c7ff4..4de3f7d4): closed as a route fix; user and admin invitations are unaffected. The same takeover through the data API is F-70.

### 41d4/F-64 [P3] closed - The Gridmaster check failed open on a read error

**File:** `apps/web/src/app/api/employees/shared.ts:37`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** A transient profile read error skipped the fresh-proof gate.
**Suggested fix:** Throw on the error.
**Resolution:** `isGridmasterActor` throws on a read error, so the route answers 500 rather than skipping the gate. Re-review (821c7ff4..4de3f7d4): closed.

### 41d4/F-65 [P3] closed - A cancelled reinvite said nothing, and one editor revoked before asking for proof

**File:** `apps/web/src/hooks/useEmployees.ts:213`; `apps/web/src/components/staff-detail/StaffDetailPage.tsx:441`; `apps/web/src/components/staff/EmployeeManagementAccessModal.tsx:251`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** After an address change the old invitation is gone, and a cancelled prompt left no message that no new one went out; the management editor revoked a pending invitation before the role change's prompt, so a cancel left it revoked.
**Suggested fix:** Tell the person no invitation was sent; revoke after the role change.
**Resolution:** A cancelled reinvite shows "Employee saved. No new invitation was sent."; the editor revokes only after the role change completes. Re-review (821c7ff4..4de3f7d4): closed.

### 41d4/F-66 [P3] closed - A refused access replacement spent the recipient's send limit

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:591`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** Each stale-session attempt used a send slot for that recipient.
**Suggested fix:** Ask for proof before the limiter.
**Resolution:** The Gridmaster gate for access replacement runs before the recipient limit; the inventory pins the order. Re-review (821c7ff4..4de3f7d4): closed.

### 41d4/F-67 [P3] closed - Another unused browser-side grant helper

**File:** `apps/web/src/lib/db/invitations.ts:25`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** `sendInvitation` called `send_invitation` from the browser with no callers, inviting an ungated path back.
**Suggested fix:** Remove it.
**Resolution:** Removed. Re-review (821c7ff4..4de3f7d4): closed.

### 41d4/F-70 [P1] closed - Admins could read invitation tokens and rewrite invitations through the data API

**File:** `supabase/migrations/003_rls_policies.sql:755`; `supabase/migrations/004_grants.sql:59`
**Found:** 2026-09-26 by `/audit` re-review of 4de3f7d4 (predates 41d4)
**Why it matters:** `invitations_select` let an organization's Admins read its rows and the table grant covered every column, so an Admin could read a pending Super Admin invitation's token and register as its invitee. `invitations_revoke` also let an Admin who manages employees update any column, including `role_to_assign`, `email` and `invited_by`, past every route check. The Gridmaster form of the same door is F-60.
**Suggested fix:** Revoke the table privilege from `authenticated` and grant reading every column except the token, as 036 did for employee contacts.
**Resolution:** Migration `049_invitation_token_server_only.sql` revokes every privilege on `invitations` from `authenticated` and regrants reading the sixteen columns other than `token`; nothing in the browser writes the table or reads the token, and every server path uses the service role or a SECURITY DEFINER function. A static test pins the migration, and the live isolation test asserts no token read and no insert, update or delete. Applied to the local stack; production needs 049 applied by the runbook before the release that carries it. This also removes the invitation half of F-60 (a Gridmaster token can no longer write invitations directly). Re-review (4de3f7d4..58ff57cd): closed; nothing running as `authenticated` reads the token or writes the table, every writer is SECURITY DEFINER, no later grant restores the privilege, and the migration is idempotent and safe to apply forward.

## How to try it

1. Sign in to the Gridmaster portal as `qa-gridmaster@dubgrid.test` on the
   local stack, open Calm Haven, then the Users tab.
2. Add `delivered@resend.dev` as Super Admin: an address with no account gets
   an invitation ("Invitation sent to ...").
3. Wait more than five minutes after signing in and add another address: a
   "Confirm your identity" prompt appears first, and nothing is created until
   it is answered.

Verified 2026-09-26 in the browser on the local stack; both invitations were
revoked afterwards.
