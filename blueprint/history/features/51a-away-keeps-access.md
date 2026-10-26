# Feature: Away keeps access

**From build-plan:** feature 51a (item 51, Staff statuses)
**Status:** verified

## Goal

Someone marked inactive (Away, once 51b renames it) keeps everything except
being scheduled:

- they can still sign in;
- they keep their role and every power it gives, on web, on mobile and in
  the database;
- they aren't signed out.

Billing follows: an Away person takes a seat only while their role lets them
manage.

Today an inactive person is cut to read-only and signed out everywhere, so an
Admin on leave can't do their job.

## Design reference

The "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo):

- the Status key board: Away means "Sign in: Yes, role unchanged" and "Seat:
  Only if they can manage";
- the Billing seats board.

This step has no visual change beyond the banner text.

## In scope

- Shared permissions stop collapsing an inactive person to read-only.
  `isInactive` stays as a plain fact about the caller.
- The web route checks drop their own read-only rule (`requireOrgPermissions`,
  `canManageEmployees`).
- The database function `update_mobile_employee_with_audit` stops refusing an
  inactive actor (migration 098).
- Marking someone inactive no longer signs them out. Removing still does.
- Mark inactive is offered and accepted only for someone on the schedule
  (with a focus area). A management-only person can only be removed until
  Suspend arrives in 51c.
- Text that becomes false gets fixed:
  - the deactivate dialog line "They'll temporarily lose management access";
  - the "Your account is inactive" banner.
- Onboarding no longer skips an inactive person.
- Seat counting adds an inactive person whose live membership is Admin or
  Super Admin.

## Out of scope

- **Status names** (Away, Archived), pills, tabs, filters, the styled Away
  banner and the billing seat breakdown: 51b.
- **Suspended**: 51c and 51d.
- **Return date, absence fill and the daily job**: 51e and 51f.
- **Last day**: 51g.
- **Bulk changes**: 51h.
- **Moving schedule changes into the draft.** Migration 067 already turns a
  published shift into a pending removal, so nothing changes here.
- **Syncing seats to Stripe.** It stays a Gridmaster action and checkout
  behavior. No automatic sync is added.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared permissions keep the role.**
  - In `packages/authz/src/index.ts`, `buildPermissionContext` no longer
    returns `READ_ONLY_PERMS` for `isInactive`. It builds the normal context
    and sets `isInactive: true`.
  - `buildPerms` passes it through unchanged.
  - Rebuild the package.

  _Done when:_ `packages/authz` tests show:
  - an inactive Admin with `canManageEmployees` keeps it and their level;
  - an inactive Super Admin keeps `canManageUsers`;
  - an inactive User has the same permissions as an active User;
  - `isInactive` is still `true` in each case.

  The mobile `auth-context` test shows an inactive Admin's mobile permissions
  keep their manage capabilities.

- [x] **Step 2 - Web routes stop sidelining.**
  - `requireOrgPermissions` (`app/api/shared/permissions.ts`) and
    `canManageEmployees` (`app/api/employees/shared.ts`) drop the
    `isCallerInactive` read and their inactive branch.
  - `/api/account/permissions` still reports `isInactive` for the banner, now
    for Super Admins too. It keeps `isCallerInactive`, its only remaining
    user.

  _Done when:_ route tests show:
  - an inactive Admin with `canManageEmployees` can change another person's
    status and edit a person;
  - an inactive Admin passes `requireOrgPermissions` for a permission they
    hold;
  - `/api/account/permissions` returns their full permissions with
    `isInactive: true`.

- [x] **Step 3 - The database stops refusing an inactive actor (migration
      098).**
  - `CREATE OR REPLACE` `update_mobile_employee_with_audit` from its latest
    definition in `009_atomic_mobile_employee_audit.sql`. Drop the
    `v_actor_employee_status <> 'inactive'` condition and change nothing
    else.
  - Lock the hash in `checksums.sha256`.

  _Done when:_
  - `npm run db:migrations:check` passes;
  - a live test shows an inactive Admin with `canManageEmployees` can update
    a person through the function;
  - an Admin without that permission is still refused.

- [x] **Step 4 - Status changes on the server.**
  - `POST /api/employees/status` stops calling `revokeAllUserSessions` for
    `deactivate` and keeps it for `remove`.
  - Someone with no focus area can't be made inactive. The refusal is a 400
    with "Only someone on the schedule can be marked inactive." It applies on
    all three paths that set the status:
    - the web status route;
    - `packages/mobile-api-core/src/people-status.ts`;
    - `updateEmployee` in `app/api/employees/manage/route.ts` when the status
      changes to `inactive`.
  - Put the check in one shared helper in `packages/domain`, next to
    `isOnSchedule`.

  _Done when:_ tests show:
  - deactivate no longer revokes sessions, and remove still does;
  - all three paths refuse to make a management-only person inactive;
  - all three still accept someone with a focus area.

- [x] **Step 5 - Status actions on web and mobile.**
  - Mark inactive shows only for someone on the schedule:
    - in `EmployeeStatusActions.tsx`;
    - in the mobile `PersonDetailScreen.tsx` outcome choice, where a
      management-only person sees only Remove.
  - The web and mobile dialog line becomes "They'll be off the schedule and
    keep their access. You can reactivate them anytime." The
    management-access line goes away.

  _Done when:_ on the dev server and the simulator, a management-only person
  offers no Mark inactive and a scheduled person does, with the new line.

- [x] **Step 6 - What the person sees.**
  - The banner in `InactiveAccountBanner.tsx` reads only "You're away." The
    read-only and "regain full access" wording goes. The styled banner comes
    in 51b.
  - `onboarding-decision.ts` drops the `isInactive` early return, so an
    inactive Admin can finish setup and their own onboarding.
  - `permissionsRealtime.ts` drops `cached.isInactive` from its always-refetch
    condition.

  _Done when:_
  - the onboarding-decision tests show an inactive person goes through
    onboarding like anyone else;
  - signed in on the dev server as an inactive QA Admin, the banner says
    "You're away." and People shows their manage actions.

- [x] **Step 7 - Seats.**
  - `countBillableSeats` (`features/billing/seats.ts`) counts an inactive,
    unarchived employee as a seat when their live membership's `org_role` is
    `admin` or `super_admin`.
  - Memberships carry `org_role`.
  - The loaders select it:
    - `features/billing/server.ts`;
    - both calls in `app/api/gridmaster/_lib/oversight.ts`.

  _Done when:_ `seats.ts` tests show:
  - an inactive Admin takes a seat;
  - an inactive User does not;
  - an inactive person with no account does not;
  - an active person counts once;
  - an internal account never counts.

## Files / areas

- `packages/authz/src/index.ts` and its test.
- `packages/mobile-api-core/src/auth.ts` and its `auth-context` test.
- `packages/mobile-api-core/src/people-status.ts` and its test.
- `packages/domain/src/employment-status.ts` and its test.
- `apps/web/src/app/api/employees/manage/route.ts` and its test.
- `apps/mobile/src/features/people/screens/PersonDetailScreen.tsx`.
- `apps/web/src/app/api/shared/permissions.ts` and its test.
- `apps/web/src/app/api/employees/shared.ts`.
- `apps/web/src/app/api/account/permissions/route.ts` and its test.
- `apps/web/src/app/api/employees/status/route.ts` and its test.
- `apps/web/src/components/staff-detail/EmployeeStatusActions.tsx`.
- `apps/web/src/components/InactiveAccountBanner.tsx`.
- `apps/web/src/components/onboarding/onboarding-decision.ts` and its test.
- `apps/web/src/features/permissions/permissionsRealtime.ts`.
- `apps/web/src/features/billing/seats.ts`, `server.ts` and the seats test.
- `apps/web/src/app/api/gridmaster/_lib/oversight.ts`.
- `supabase/migrations/098_away_keeps_access.sql` and `checksums.sha256`.

## Data / contracts

- **`PermissionContext.isInactive` (load-bearing).** It now means "the
  caller's employee row is inactive" and nothing more. It no longer implies
  reduced permissions. 51b's Away banner reads it.
- **`SeatMembership` gains `org_role`.** Its consumers are the billing summary
  and the Gridmaster oversight counts.
- **`update_mobile_employee_with_audit`.** Its signature is unchanged.
- **No new columns.** `employee_status` keeps `active`, `inactive` and
  `removed`.

## Testing

Vitest covers:

- authz context building;
- seat counting;
- the onboarding decision;
- the status, permissions and mobile people-status handlers;
- the migration (a live test against the local stack).

Before `/complete`:

- run `npm run type-check`, `npm run lint`, `npm run test` and
  `npm run db:migrations:check`;
- check on the dev server, as an inactive QA Admin, that the banner reads
  "You're away." and the manage actions show.

## Notes for the AI

- **Existing inactive people regain their powers on deploy.** That includes
  anyone deactivated to strip management access.
  - Before the release that carries 51a, the owner should run a read-only
    production query for inactive employees whose live membership is Admin or
    Super Admin, and decide for each one: change the role, remove them, or
    leave them.
  - Never change production data from this feature.
- **"Can manage" for billing means the role** (Admin or Super Admin), not a
  management department. Departments grant no permissions, per
  `RBAC_SYSTEM_DESIGN.md`.
  - The canvas line "Remove their management access to stop billing for it"
    becomes "Change their role to User" in 51b.
- **Keep migration 067 untouched.** Leaving `active` still clears what's ahead
  through the draft, and an inactive person still can't be scheduled.
- **Gridmaster rules don't change.** The impersonation and fresh-proof rules
  stay as they are.
- **Copy rules from the owner, 2026-10-26.**
  - Staff copy names only their state and its date.
  - Call the product "the app", never DubGrid.
  - Manager dialogs may spell out consequences.
- **Where to work.** Use your own worktree on `feature/51a-away-keeps-access`
  cut from local `dev`, per `AGENTS.md`.
