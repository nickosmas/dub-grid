# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Admins stay inside their tier

**Type:** Fix
**Status:** verified
**Branch:** `fix/admin-tier-boundary` (worktree `.claude/worktrees/fix-admin-tier-boundary`)
**Fixes:** F-238, F-239, F-240, F-218, F-245, F-243, F-252

### The problem

The 2026-11-10 permissions audit found three ways an Admin's power doesn't match their tier:

1. **Admins create stronger Admins (F-238, and F-218).** Inviting needs only Staff: Edit
   (`canManageEmployees`), and `canAssignOrgRole` (`apps/web/src/app/api/employees/shared.ts:52`)
   blocks only `super_admin`. An Admin invited this way gets the standard Admin set (edit,
   publish, notes, recurring, reports) whatever the inviter holds, so an Admin trusted only
   with staff records can invite a second address of their own and gain publish rights. Moving
   a pending Admin invitation to a new address (F-218) is the same escalation. The mobile
   invite route (`features/mobile/server/routes/person-invitation.ts:297`) has its own copy of
   the super-admin-only check.
2. **Admins with no stored set are refused (F-239, and F-245).** The app resolves a missing
   permission key to the Admin default; the database (`check_admin_permission`, publish in
   `092`) reads it as false. Every User promoted to Admin, and every Admin invited without
   custom permissions, sees Edit and Publish but is refused, until a Super Admin saves a full
   set. Only the web access route clears the set on demotion, so demoting and re-promoting
   anywhere else restores an old, unreviewed set. A stored `canManageOrgSettings: true` is
   accepted though it can never apply.
3. **Admins suspend Super Admins (F-240).** `canOffboardAtTier` guards offboard and restore,
   not suspend. An Admin with Staff: Edit can suspend an organization owner, which signs them
   out everywhere, on web (`features/employees/server/status-change.ts:268`, used by the
   single and bulk routes) and mobile (`packages/mobile-api-core/src/people-status.ts:527`).
4. **The Staff row says the wrong thing (F-243).** "With Edit, they can also ... set their
   access role" (`packages/authz/src/permission-modules.ts:103`): only a Super Admin can.

### The fix

- **Only a Super Admin or Gridmaster gives the Admin tier.** `canAssignOrgRole` returns true
  only for `user` unless the actor is a Super Admin or Gridmaster; every web invite path
  (create, edit, move, replace access) already calls it. The mobile invite route uses the same
  rule. Admins keep inviting people as Users. This matches `change_user_role`, which already
  refuses an Admin promoting anyone into Admin, and Stripe's and When I Work's grant ceilings.
- **Every Admin always stores a complete set, in one place.** Migration `131` adds a
  `BEFORE INSERT OR UPDATE` trigger on `organization_memberships`:
  - for an Admin, the stored set becomes the Admin defaults, overlaid with the stored boolean
    keys it knows, with `canViewSchedule` and `canViewStaff` on and `canManageOrgSettings` off;
  - for anyone else, it becomes `NULL`.

  This covers every writer at once (web and mobile promotion, `change_user_role`, invite
  acceptance, the Gridmaster functions), so a re-promotion starts from the defaults. The
  migration backfills existing rows through the trigger. The defaults live in one SQL function,
  and a test fails if it ever differs from `ADMIN_DEFAULT_PERMS`.

- **Suspension follows the offboard tier rule.** Suspend, a planned suspension, changing the
  end date and reinstating a Super Admin need a Super Admin or Gridmaster, on web (single and
  bulk) and mobile. Like Offboard, Suspend stays listed for a Super Admin target, disabled with
  the reason, and bulk names them as skipped with that reason.
- **The Staff row says what Edit allows:** see profiles and contact details; with Edit, add
  and invite people as Users, and change their status.

**Must not break:**

- Super Admins and Gridmasters keep everything they do today, impersonation rules included.
- An Admin's saved custom set reads the same before and after the backfill. Only missing keys
  are filled and `canManageOrgSettings` is cleared.
- Pending Admin invitations an Admin already sent still work. They were created by the old
  rule, and invitations are written only by the server.
- Away, Mark active and every other status change keep their current rules.

**Production:** migration `131` is a stop before the release PR (`AGENTS.md`). Run the F-239
count query first so we know how many Admins it fills.

### Build steps

1. [x] **Prototype the visible changes** (Design canvas Artifact, phone and desktop
       artboards), and get the owner's approval before any UI code:
   - the invite role picker an Admin sees, web and mobile (User only, or Admin listed and
     disabled with its reason);
   - Change status for a Super Admin as seen by an Admin, with Suspend disabled and its reason;
   - the bulk confirmation naming a skipped Super Admin;
   - the Staff row's new description in the permissions editor.

   **Done when:** the owner approves one option for each.

   **Approved 2026-11-10:** for an Admin, web's Access role reads "User" with "Only a Super
   Admin can invite someone as an Admin." under it, no dropdown (option A; a Super Admin
   keeps the dropdown); the app lists Admin
   disabled with that reason; Suspended is disabled for a Super Admin target with "Only a
   Super Admin can suspend a Super Admin."; bulk lists them under Skipped with that reason.
   Prototype: https://claude.ai/artifact/XYv3Q3DnTUcxiSWqNaqimy

2. [x] **Admin tier is a Super Admin's to give.** Change `canAssignOrgRole`, the mobile invite
       route's check and the invite pickers (`inviteRoleOptions`, `OrgRoleChoice`) as the
       prototype shows. Route tests cover an Admin inviting as User (allowed), as Admin (403 with
       an audit row), raising a pending invite to Admin, and moving a pending Admin invite (403).
       **Done when:** those tests pass, and fail against the old rule.
3. [x] **Complete permission sets** (migration `131`, checksum locked). Add the defaults
       function, the trigger and the backfill. Add a live test that:
   - a User promoted by `change_user_role` passes `check_admin_permission('canEditShifts')`
     and can publish;
   - a demoted Admin stores `NULL`, and on re-promotion gets the defaults rather than the old
     set;
   - an accepted Admin invite with no set stores the defaults;
   - `canManageOrgSettings` is stored false;
   - the SQL defaults equal `ADMIN_DEFAULT_PERMS`.

   **Done when:** that test passes and `npm run db:migrations:check` passes.

4. [x] **Suspension tier guard.** Extend the tier check in `applyStatusChange` and mobile
       `people-status.ts` to suspend, planned suspension, `setSuspendedUntil` and `reinstate`.
       Add the reason message to `@dubgrid/domain`, and show it in the status dialogs and bulk as
       prototyped. Tests cover an Admin refused on each action for a Super Admin, and allowed for
       an Admin or User target.
       **Done when:** the tests pass on web and mobile, and fail against the old guard.
5. [x] **Copy.** Update the Staff row description, and `docs/reference/admin-permissions.mdx`
       to match.
       **Done when:** `npm run docs:check` passes.

6. [x] **Repair F-240's remaining path and F-252** (re-review, 2026-11-10). A Super Admin's
       planned suspension, last day or return can't be replaced by an Admin's other status change
       (web, bulk, mobile, and every choice disabled with the reason), and only a Gridmaster calls
       `assign_org_role_by_email`. Migration 131 stores sets without the views an Edit implies and
       applies them in `check_admin_permission`, so the editor keeps each view as chosen.

### Evidence

- `npm run build:packages`, `type-check`, `lint` and `test` pass on every workspace (web 790 files, 7,713 tests; mobile 203 files, 1,691 tests).
- All 81 live integration suites pass with 131 applied locally, including `admin-permissions-complete`, `role-escalation-guards`, `org-isolation` and `migration-113`.
- Each new route, bulk, mobile, domain and live test fails against the old rule.
- `npm run db:migrations:rehearse -- --from 130` passed on a throwaway stack (`internal/operations/migration-rehearsals/2026-11-10-130-to-131.md`); production is at 130 by the read-only inspector.
- Browser, as the seeded QA Admin on a dev server from this worktree: Add staff members shows Access role "User" with the reason, and a Super Admin's status card offers only Mark away.
- Independent re-review closed F-218, F-238, F-239, F-240, F-243, F-245 and F-252.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test`, and the new live migration test on the
  local stack.
- In the browser as the seeded QA Admin (Staff: Edit on): Add Staff Members offers User only;
  Change status on a Super Admin shows Suspend disabled with the reason.
- As a Super Admin: promote a User to Admin, then publish as that Admin. It succeeds where
  today it is refused.
- On the iOS Simulator: the invite role choice and the status sheet match the prototype.

## Findings

### admin-tier-boundary/F-218 [P2] closed - Moving a pending Admin invitation keeps its stored permissions

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:320-323`, `:423-435`; `accept_invitation` (`113:172`)
**Found:** 2026-11-07 by /audit (scope: repairs of F-190 to F-198; lens: security)
**Why it matters:** PATCH checks only the Super Admin tier. On the stack an Admin who can manage staff moved an Admin invitation holding `canManageBilling` to their own second address, and the permissions stayed for `accept_invitation` to apply. Rotating the token doesn't help, because the new mailbox is theirs. `employees/move-email/route.ts:155` already refuses this case.
**Suggested fix:** Apply move-email's rule, or clear `admin_permissions` when the address changes.
**Resolution:** Fixed with F-238 on fix/admin-tier-boundary (2026-11-10): redirecting a pending invitation needs the editor to be able to give its role, so an Admin can no longer move an Admin invitation; an edit that resends the unchanged role checks nothing, so editing such an invitation's other fields still works. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-238 [P1] closed - An Admin with Staff: Edit can create Admins who hold more than they do

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:252-266`; `apps/web/src/app/api/employees/shared.ts:52-60` (`canAssignOrgRole`); `apps/web/src/features/organization/server/invitation-permissions.ts:15`; `packages/authz/src/index.ts:90-96`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security, quality, UX)
**Why it matters:** Inviting needs only `canManageEmployees`, and `canAssignOrgRole` blocks only `super_admin`. An Admin invite from an Admin stores `admin_permissions = NULL`, which the app resolves to the standard Admin set (edit, publish, notes, recurring, reports). So an Admin trusted only with Staff: Edit can invite a second address of their own as Admin and gain publish and report rights they were never given. The same applies to raising a pending User invite to Admin (`invitations/route.ts:322`). It also contradicts `change_user_role`'s own rule that an Admin can't promote anyone into Admin (053). Traced in code, not run.
**Suggested fix:** Only a Super Admin or Gridmaster grants the Admin tier (invite, edit and replace alike), or cap an invite's permissions at the inviter's own resolved set. Update the Staff row's description to match.
**Resolution:** Fixed on fix/admin-tier-boundary (2026-11-10): `canGrantOrgRole` in `@dubgrid/domain` lets only a Super Admin or Gridmaster give an elevated tier, and `canAssignOrgRole` (web create, edit, redirect and replace) and the mobile invite route apply it, answering "Only a Super Admin can invite someone as an Admin." with an audit row. The web invite surfaces state Access role as User with that reason for anyone else; the app lists Admin disabled with it. Pending Admin invitations sent before stay valid (owner, 2026-11-10). Route and helper tests fail against the old rule. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-239 [P1] closed - An Admin with no stored permission set is shown Edit and Publish, and the database refuses them

**File:** `supabase/migrations/002_functions_triggers.sql:88-104` (`check_admin_permission`), `092_absence_times.sql:949-960` (publish); `packages/authz/src/index.ts:90-96`; writers that leave NULL: `apps/web/src/app/api/organizations/access/route.ts:280-286`, mobile `person-org-role.ts`, `change_user_role`, `invitation-permissions.ts:15` with `accept_invitation` (113)
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security, quality, UX)
**Why it matters:** The app resolves a missing key to the Admin default (true for edit, publish, notes, recurring and series); SQL reads the raw key and treats missing as false. Run on the local stack in a rolled-back transaction: the seeded Admin's `check_admin_permission('canEditShifts')` was true with their stored set and false for edit, notes, series and recurring once it was NULL. Publish is called with the actor and checks the raw key, so it refuses; RLS hides drafts and recurring rows from the grid. Every User promoted to Admin and every Admin invited without custom permissions lands here until a Super Admin saves a full set. Fails closed, so not a leak, but the UI promises what the server refuses. Whether production holds such rows is unknown: `select count(*) from organization_memberships where org_role='admin' and archived_at is null and (admin_permissions is null or not admin_permissions ?& array['canEditShifts','canPublishSchedule','canEditNotes','canManageRecurringShifts','canManageShiftSeries'])`.
**Suggested fix:** Store a complete set wherever someone becomes an Admin (promotion on web and mobile, `change_user_role`, invite acceptance), backfill existing NULL and partial rows with `ADMIN_DEFAULT_PERMS` in a migration, then add a CHECK or trigger that an Admin's set has every key. One source of defaults, not two.
**Resolution:** Fixed on fix/admin-tier-boundary (2026-11-10): migration 131 adds a trigger on `organization_memberships` that stores, for every Admin, the set the app resolves (the defaults overlaid with the stored boolean keys it knows, View and Staff on, organization settings off, each View its Edit implies) and NULL for anyone else, and backfills existing rows without logging a permission change or moving `updated_at`. `check_admin_permission` and publish therefore grant what the app shows. `admin_default_permissions()` must equal `ADMIN_DEFAULT_PERMS`; `admin-permissions-complete.integration.test.ts` compares them and the resolver, and promotes a User through `change_user_role` to prove edit and publish pass. Local stack: 7 Admins filled, 6 of them losing a stored `canManageOrgSettings: true`. Production needs 131 applied. Re-review (2026-11-10) found that storing the views an Edit implies would keep Dashboard: View on after its Edits were turned off; 131 now stores the editor's set (`complete_admin_permissions`) and applies the implications on read (`resolve_admin_permissions`, used by `check_admin_permission`), as the app does. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-240 [P1] closed - An Admin with Staff: Edit can suspend a Super Admin

**File:** `apps/web/src/features/employees/server/status-change.ts:268` (tier guard covers offboard and restore only), `:440-462`; `packages/mobile-api-core/src/people-status.ts:527`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security)
**Why it matters:** `canOffboardAtTier` runs for offboarding and restoring, not for `suspend` or a planned suspension. The only suspend guard is that another Super Admin can still sign in. So an Admin can sign an organization owner out everywhere and block their sign-in, from web or mobile. A lower tier acting on a higher one breaks the rule every other access path keeps. Traced in code, not run.
**Suggested fix:** Apply the offboard tier rule to suspend, planned suspend and reinstate, on web, bulk and mobile, with a test per path.
**Resolution:** Fixed on fix/admin-tier-boundary (2026-11-10): suspending, planning, moving or cancelling a suspension and reinstating now follow the offboard tier rule on web (single and bulk, `applyStatusChange`) and mobile (`tierRefusal`), answering "Only a Super Admin can suspend a Super Admin." or "...reinstate a Super Admin." with 403. `statusChoices` lists Suspended and Reinstate disabled with that reason when the manager can't reach the tier, so Change status, the app's sheet and bulk Skipped agree; an Admin looking at an active Super Admin has Away left, so the card names it Mark away (the single-choice rule). Route, bulk, mobile and domain tests fail against the old guard. Re-review (2026-11-10) found an Admin could still replace a Super Admin's planned suspension or last day by planning an Away; any status change on a Super Admin with a planned suspension, last day or return now needs the tier too (web, bulk and mobile), and `statusChoices` disables every choice with the plan's reason. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-243 [P2] closed - The Staff row says it sets access roles, and doesn't say it can create Admins

**File:** `packages/authz/src/permission-modules.ts:100-104`; `docs/reference/admin-permissions.mdx:23`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: UX)
**Why it matters:** "With Edit, they can also ... set their access role" is wrong: changing a member's role is Super Admin only (`access/route.ts:90-94`). It also omits what Edit does allow: inviting people as Admin (F-238), suspending and offboarding. A Super Admin deciding who gets the strongest switch reads the wrong consequences.
**Suggested fix:** Describe exactly what the server allows once F-238 and F-240 are settled, and show a one-line warning when Staff: Edit is turned on.
**Resolution:** Fixed on fix/admin-tier-boundary (2026-11-10): with F-238 and F-240 settled, the Staff row reads "With Edit, they can also add people, invite them as Users, and change their status." (`permission-modules.ts`), and the Admin permissions reference says Staff: Edit invites as Users and lists inviting Admins and changing a Super Admin's access among what only a Super Admin does. The one-line warning when Staff: Edit is turned on was not added; F-247 covers the editor's other notes. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-245 [P3] closed - Re-promotion restores a stale permission set, and stored sets aren't normalized

**File:** `change_user_role` (053:202-204, 126:311); `apps/web/src/lib/db/organizations.ts:327-334`; mobile `person-org-role.ts:92`; `apps/web/src/app/api/organizations/access/route.ts:44`
**Found:** 2026-11-10 by /audit (scope: admin permissions; lens: security, quality)
**Why it matters:** Only the web access route clears permissions on demotion. Demote through mobile, the RPC or a Gridmaster path, then promote again, and the old set comes back, possibly with Staff: Edit or approvals from a past stint nobody re-reviewed. The route also accepts and stores `canManageOrgSettings: true` (6 of 7 local seeded Admins carry it), which the resolver forces off and SQL never reads, and its comment says partial sets resolve against the read-only base when they resolve against Admin defaults.
**Suggested fix:** Clear the set inside `change_user_role` whenever the role leaves Admin, write a reviewed set on every promotion (with F-239), and drop non-configurable keys on save.
**Resolution:** Fixed with F-239 on fix/admin-tier-boundary (2026-11-10): the 131 trigger stores NULL whenever the role leaves Admin, by any path, so a re-promotion starts from the defaults, and it drops unknown keys and `canManageOrgSettings` on every write. The alert and summary parts are F-246. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.

### admin-tier-boundary/F-252 [P1] closed - Any Admin can demote a Super Admin, or add any account to their organization, through `assign_org_role_by_email`

**File:** `supabase/migrations/051_gridmaster_grants_need_fresh_proof.sql:223-283` (`assign_org_role_by_email`, granted to `authenticated`)
**Found:** 2026-11-10 by /audit (re-review of fix/admin-tier-boundary; lens: security)
**Why it matters:** The function refused an Admin only an Admin or Super Admin _target_ role. With no permission switch on, an Admin could call it through the data API with a Super Admin's email and `user`, and its `ON CONFLICT` branch demoted them, skipping `change_user_role`'s rule and its audit. It also revived archived memberships and added any existing account on the platform to the organization as a User without an invitation. Only the Gridmaster portal calls it (`gridmaster/organizations/manage/route.ts`). Confirmed in code and grants (`authenticated` may execute it), not run as an exploit.
**Suggested fix:** Only a Gridmaster may call it.
**Resolution:** Fixed on fix/admin-tier-boundary (2026-11-10): migration 131 redefines it with 051's body, refusing anyone who isn't a Gridmaster after the fresh-proof check. `role-escalation-guards.integration.test.ts` shows an Admin (any target role, a Super Admin demotion included) and a Super Admin are refused; the Gridmaster fresh-proof tests still pass it with fresh proof. Closed 2026-11-10 by an independent re-review of the branch at 25bc650b1: the defect is gone and the repair adds none.
