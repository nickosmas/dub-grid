# Current Feature

> **Generated file.** Holds the one feature, fix, or rollback being built right now. Run
> `/feature <number-or-name>` to spec a build-plan feature, or `/fix "<bug>"` for
> an ad-hoc fix. Use `/rollback <completed-feature>` to plan a safe reversal.
> Build one thing at a time; `/complete` archives it under
> `blueprint/history/` and resets this file.

## Admins stay inside their tier

**Type:** Fix
**Status:** in progress
**Branch:** `fix/admin-tier-boundary` (worktree `.claude/worktrees/fix-admin-tier-boundary`)
**Fixes:** F-237, F-238, F-239, F-218, F-244, F-242

### The problem

The 2026-11-10 permissions audit found three ways an Admin's power doesn't match their tier:

1. **Admins create stronger Admins (F-237, and F-218).** Inviting needs only Staff: Edit
   (`canManageEmployees`), and `canAssignOrgRole` (`apps/web/src/app/api/employees/shared.ts:52`)
   blocks only `super_admin`. An Admin invited this way gets the standard Admin set (edit,
   publish, notes, recurring, reports) whatever the inviter holds, so an Admin trusted only
   with staff records can invite a second address of their own and gain publish rights. Moving
   a pending Admin invitation to a new address (F-218) is the same escalation. The mobile
   invite route (`features/mobile/server/routes/person-invitation.ts:297`) has its own copy of
   the super-admin-only check.
2. **Admins with no stored set are refused (F-238, and F-244).** The app resolves a missing
   permission key to the Admin default; the database (`check_admin_permission`, publish in
   `092`) reads it as false. Every User promoted to Admin, and every Admin invited without
   custom permissions, sees Edit and Publish but is refused, until a Super Admin saves a full
   set. Only the web access route clears the set on demotion, so demoting and re-promoting
   anywhere else restores an old, unreviewed set. A stored `canManageOrgSettings: true` is
   accepted though it can never apply.
3. **Admins suspend Super Admins (F-239).** `canOffboardAtTier` guards offboard and restore,
   not suspend. An Admin with Staff: Edit can suspend an organization owner, which signs them
   out everywhere, on web (`features/employees/server/status-change.ts:268`, used by the
   single and bulk routes) and mobile (`packages/mobile-api-core/src/people-status.ts:527`).
4. **The Staff row says the wrong thing (F-242).** "With Edit, they can also ... set their
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

**Production:** migration `131` is a stop before the release PR (`AGENTS.md`). Run the F-238
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

### Verify

- `npm run type-check`, `npm run lint`, `npm run test`, and the new live migration test on the
  local stack.
- In the browser as the seeded QA Admin (Staff: Edit on): Add Staff Members offers User only;
  Change status on a Super Admin shows Suspend disabled with the reason.
- As a Super Admin: promote a User to Admin, then publish as that Admin. It succeeds where
  today it is refused.
- On the iOS Simulator: the invite role choice and the status sheet match the prototype.
