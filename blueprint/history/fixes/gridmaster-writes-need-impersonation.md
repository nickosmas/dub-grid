# Fix: A Gridmaster changes an organization only while impersonating it

**Type:** Fix
**Status:** verified
**Fixes:** F-75

## The problem

The schedule, recurring, publish and request functions are granted to
`authenticated` and let any Gridmaster through. A stale or stolen Gridmaster
token could therefore edit schedules, publish, and settle requests in every
organization by calling them through the data API. On the app side,
`requireOrgPermissions` let a Gridmaster into any organization, and two writes
(publish, job overrides) reach the database as the service role, where no
Gridmaster session exists.

## The fix

The owner refused to accept the finding on 2026-09-28. They didn't want the
five-minute fresh-proof prompts that a proof-based fix would bring to
impersonated editing. So the fix binds a Gridmaster's authority to an active
impersonation, which already needs fresh proof to start (055).

- **Migration `075`:**
  - `caller_impersonates_org(org)` accepts an unexpired, unended impersonation
    of that organization started by the caller's own auth session.
  - `is_authorized_org` and `check_admin_permission_for_org` use it for the
    Gridmaster branch, and return a definite `FALSE` instead of `NULL`. The live
    test showed that a `NULL` there passed their callers' `IF NOT` checks.
  - `create_shift_request`, `volunteer_for_open_shift`, `claim`, `cancel`,
    `respond` and `resolve_shift_request`, `publish_schedule` and
    `set_job_shift_overrides` keep their bodies under `_unguarded` names that
    `authenticated` cannot call. Their public names first run
    `refuse_gridmaster_outside_org`, which recognises a Gridmaster by profile.
  - Members, the sandbox owner and service-role callers are unaffected.
- **Routes:**
  - `requireOrgPermissions` gains `gridmasterNeedsImpersonation`. A Gridmaster
    who isn't a member needs an active impersonation from the same session, or
    gets a 403 with "Start an impersonation of this organization to change its
    data."
  - Every write in the schedule manage, recurring, requests and publish routes
    sets it, and settings sets it for `*Manage` permissions.
  - A static test fails if a write action forgets it.
- **Docs:** `RBAC_SYSTEM_DESIGN.md` §8.3.

## Build steps

- [x] **1. Migration 075 and its live test.**
  - _Done when:_ a Gridmaster outside an impersonation is refused by the
    helpers, a real schedule function, request settlement and publish.
  - They are allowed inside one from the same session, and refused when it has
    ended, has expired or belongs to another session.
  - Non-Gridmasters are untouched, and no `_unguarded` body is callable.
- [x] **2. Route gate.**
  - _Done when:_ `requireOrgPermissions` tests show the refusal, the
    same-session pass, and no change for members and reads.
  - The route inventory flags every write action.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run db:migrations:check` (after 073 and 074 from the findings stack
  land).
- **Browser:** as a Gridmaster, start an impersonation of Calm Haven and edit
  the schedule; it saves. End the impersonation, then call the same route or
  RPC; it is refused.
