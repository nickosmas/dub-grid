# Feature: Invitation authorization and inviter attribution

**From build-plan:** feature 41a1
**Status:** in progress - steps 1, 2, 5 and 6 done; steps 3 and 4 need a database

## Goal

A regular admin must never be able to hand out the super_admin tier, whether
by creating an invitation or by editing a pending one. The create route already
enforces that ceiling; the edit path, the replace-access path, and the row-level
layer do not. Close those, and record verifiable inviter attribution on every
server-created invitation so the acceptance-time tier check has a real identity
to test instead of a NULL.

The two halves are coupled and the order is load-bearing. Acceptance refuses a
super_admin invitation unless `invited_by` still holds that tier
(`033_row_level_trust_boundaries.sql:152`). Today invitations created through the
web route carry `invited_by = NULL`, because the route calls `send_invitation`
with the service client and the function reads `auth.uid()`
(`002_functions_triggers.sql:79`), so the check fails closed. Filling in
attribution first, without the edit-path ceiling, would make that check pass for
an invitation whose inviter is a super admin and turn a refused escalation into
a granted one. Guards land first.

## In scope

- Tier ceiling on the invitation edit path (`PATCH`) and the replace-access path
  (`POST action: "replace_access"`): refuse `super_admin` unless the caller is a
  super admin of that organization or a gridmaster, matching
  `create/route.ts:142-147`.
- The same ceiling at the row level: an UPDATE policy mirroring the INSERT
  ceiling added in `033`, and the ceiling inside
  `replace_pending_invitation_access`, which today accepts `super_admin` with no
  tier check at all (`012_replace_pending_invitation_access.sql:17`).
- Verifiable inviter attribution on every server-created invitation.
- Align create, resend, and replace permissions so an admin who may create an
  invitation may also send it.
- Regression coverage proving the refusal on every path, including the mobile
  endpoints.
- Audit coverage for every invitation authorization event, granted or refused,
  readable by super admins for their organization and by gridmasters across the
  platform.
- Every invitation tier works end to end, not only super_admin: a `user`, an
  `admin` and a `super_admin` invitation must each be creatable, deliverable and
  acceptable. The acceptance-time tier check only reads `super_admin`, so the
  other two are expected to work already; that expectation is verified rather
  than assumed, and any tier that cannot be accepted is repaired here.

## Out of scope

- Token rotation, transactional dispatch, and delivery-failure recovery (41a2).
- Recipient-facing expiry, replacement, and organization-context copy (41a3).
- The `invited_by` backfill for invitations already in the database. Historic
  rows keep failing closed, which is the safe direction; a backfill decision
  belongs with 41a3's release rehearsal.
- Changing who may create an invitation. The `canManageEmployees` gate on
  creation stays as it is.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - tier ceiling on the edit path** - extract the create route's
      super_admin check into one shared helper and apply it in `PATCH` before
      the invitation update. _Done when:_ an admin holding `canManageEmployees`
      who PATCHes `roleToAssign: "super_admin"` gets 403
      `CANNOT_ASSIGN_SUPER_ADMIN` and the row is unchanged; a super admin doing
      the same succeeds; a passing test covers both.
- [x] **Step 2 - tier ceiling on the replace-access path** - apply the same
      helper to `POST action: "replace_access"`. _Done when:_ the same admin is
      refused with the same status and error, a super admin still succeeds, and
      a passing test covers both.
- [ ] **Step 3 - the ceiling at the row level** - one forward migration:
      an `invitations_update` policy carrying the INSERT ceiling from `033`, and
      the tier check inside `replace_pending_invitation_access` so the RPC
      refuses `super_admin` from a lower-tier inviter rather than trusting its
      caller. Lock the hash in `checksums.sha256`. _Done when:_
      `npm run db:migrations:check` passes and an integration test proves the
      policy and the RPC each refuse the escalation with the routes bypassed.
- [ ] **Step 4 - inviter attribution on create** - same migration series: give
      `send_invitation` an explicit inviter parameter for the service-role path,
      and pass the authenticated caller from the create route. _Done when:_ an
      invitation created through the route has `invited_by` equal to the caller,
      a direct authenticated call still records `auth.uid()`, and a passing test
      asserts both. Additionally a `user`, an `admin` and a `super_admin`
      invitation each accept successfully, proven per tier, so no tier is left
      broken.
      The stated inviter is verified, not trusted: both RPCs that accept one
      (`send_invitation` and `replace_pending_invitation_access`, which
      `COALESCE`s its `p_invited_by` over the existing value) must refuse unless
      that user holds an active, unarchived membership in the target
      organization, and, for a `super_admin` invitation, unless they hold
      `super_admin` there or are an active gridmaster. This is the same rule
      `033` applies at acceptance, moved to the moment the row is written.
      Without it the parameter is forgeable by any service-role caller, so a
      future route could manufacture a super-admin-authorized invitation by
      naming someone else. _Also done when:_ a call naming an inviter who lacks
      the tier is refused at the database with the routes bypassed, and a
      passing test proves it.
- [x] **Step 5 - align the resend permission with the sender** - `send-invite-email`
      requires super admin or gridmaster (`route.ts:73-75`) while creation
      requires `canManageEmployees`, so an admin can create an invitation they
      cannot send. Align the gate on the create route's rule, keeping the
      existing organization-scope check. _Done when:_ an admin with
      `canManageEmployees` can send an invitation for their own organization, is
      still refused for any other organization, and a passing test covers both.

- [x] **Step 6 - audit every invitation authorization event** - every create,
      role change, replace, resend, revoke and refusal writes an audit entry
      naming the real actor, and each is readable by a super admin in the
      organization's audit log and by a gridmaster in the platform log. Creation
      writes no `audit_log` entry today (the create route only dispatches a
      notification), and no refused escalation is recorded anywhere, so a
      rejected attempt to raise an invitation to super_admin currently leaves no
      trace. _Done when:_ each of those six events produces an entry with the
      acting user, the organization, the invitation and the tier involved; a
      refused attempt is recorded as a refusal rather than silently dropped; and
      a passing test asserts an entry per event.

## Files / areas

- `apps/web/src/app/api/organizations/invitations/route.ts` - the `PATCH` and
  `POST` guards.
- `apps/web/src/app/api/employees/shared.ts` - home for the shared tier helper
  (`isOrgSuperAdminOrGridmaster` already lives here).
- `apps/web/src/app/api/organizations/invitations/create/route.ts` - pass the
  inviter; adopt the shared helper.
- `apps/web/src/app/api/send-invite-email/route.ts` - the resend gate.
- `supabase/migrations/043_invitation_tier_ceiling.sql` (next free number; 042 is
  taken) plus `supabase/migrations/checksums.sha256`.
- Tests beside each route, plus an integration test under
  `apps/web/src/__tests__/` for the row-level refusals.

## Data / contracts

- `invitations.role_to_assign` and `invitations.invited_by` are the load-bearing
  columns: acceptance reads both, so their meaning is fixed by this feature.
  `invited_by` becomes a dependable identity rather than an optimistic one.
- `send_invitation` gains an explicit inviter parameter. Decided by the user on
  2026-09-24, over the alternative of calling the RPC with the user client so
  `auth.uid()` populates naturally. The service-role path stays, and the caller
  states who the inviter is. It is a signature change on a function the create
  route and any direct authenticated caller both use, so it ships as a new
  forward migration, never an edit to an applied file. The parameter is trusted
  only because the route authorizes the caller first, so it is passed from the
  authenticated session and never from the request body, and because the
  function verifies it rather than taking it on faith (see Step 4). A parameter
  the database checks is as strong as an identity it derives, which is what
  keeps this equivalent to the user-client alternative that was not taken.
- `replace_pending_invitation_access` keeps its signature; only its body gains
  the tier check.
- Schema changes are new numbered forward migrations with the hash locked in
  `checksums.sha256`.

## Testing

Vitest and Playwright are configured, so the testing gate is on: every step
above ships a passing test in the same diff.

Logic that needs a test: the shared tier helper, the `PATCH` guard, the
`replace_access` guard, the create route's attribution, the `send-invite-email`
gate, and the row-level refusals with the routes bypassed. Route handlers count
as in-scope logic under `coding-standards.md`.

Add a regression test asserting the mobile endpoints cannot reach the
super_admin tier. They are role-locked today - `person-invitation.ts:332,373`
hardcodes `roleToAssign: "user"` and `management-user-invitation.ts` takes no
role - so this locks in behavior rather than changing it.

Manual path: as an admin with `canManageEmployees`, open a pending invitation in
People, try to change its access to super admin, and expect a clear refusal; as
a super admin, expect it to succeed.

Commands: `npm run type-check`, `npm run test:web`, `npm run lint`, and
`npm run db:migrations:check` for the migration steps. No single `Verify`
command is declared in `AGENTS.md`.

## Progress and handoff

Steps 1 and 2 are done, committed and pushed on `claude/lucid-hopper-exfpqt`:

- `1f648ec5` - the shared `canAssignOrgRole` ceiling, applied in `PATCH`, and
  the create route switched to the same helper.
- `efb29875` - the same ceiling on the replace-access path, applied before the
  RPC so a lower tier cannot record an inviter.

Evidence: 16 tests pass in `invitations/route.test.ts` and 10 in
`create/route.test.ts`; `npm run type-check` and ESLint are clean. Each guard
was confirmed to fail its test when removed, so the tests prove the guards.

Steps 3 and 4 need a real database and were not attempted in the cloud
container, which has no Docker daemon and no Supabase CLI. They resume in a
local checkout, where `npm run db:migrations:check` and the row-level
integration tests can actually run. Nothing about their scope changed.

First local run needs `npm ci` and `npm run build:packages` before any test, or
consumers fail to resolve `@dubgrid/*`.

## Notes for the AI

- Settled 2026-09-24 by the user: super_admin invitations sent from the web do
  not work at all. That confirms the mechanism. `invited_by` is NULL on
  web-created invitations, the acceptance-time tier check fails closed, and the
  invitee is refused. So Step 4 is not only hardening: it repairs a feature that
  is broken in production today. Step 1 through Step 3 must still land first,
  because Step 4 is what makes that check able to pass.
- One live escalation path is already reachable without any attribution change:
  `replace_pending_invitation_access` sets `invited_by` to the caller
  (`route.ts:636`), so a pending invitation that a super admin has put through
  replace-access carries a super-admin inviter. A junior admin can then PATCH it
  to `super_admin` and acceptance passes. Step 1 closes it.
- A second live source of the same precondition: the mobile person-invitation
  route already records a real inviter (`person-invitation.ts:330`,
  `invitedBy: loaded.auth.user.id`). Its own role is locked to `user`, so it
  cannot escalate by itself, but an invitation a super admin creates on mobile
  carries a super-admin inviter that the web PATCH can then raise. It also shows
  attribution is already expected on this table, so Step 4 restores a convention
  rather than inventing one.
- Every guard belongs at both layers. The routes call these RPCs with the
  service client, where `auth.uid()` is NULL and RLS does not apply, so a route
  check alone leaves the database trusting its caller. This is the F-06 pattern
  already in the findings ledger.
- Keep `getServiceClient()` for the writes themselves; authorize the caller
  before it, as the surrounding routes do.
- Scope every read and write by the effective sandbox-aware `orgId`, never a
  client-supplied one.
- Reuse `API_ERRORS.CANNOT_ASSIGN_SUPER_ADMIN`; do not invent a second message
  for the same refusal.
- Do not edit an applied migration. Add a forward migration and lock its hash.
- No em dashes in code, comments, or commit messages.
