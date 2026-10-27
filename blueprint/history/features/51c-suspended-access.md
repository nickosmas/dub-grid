# Feature: Suspended, access

**From build-plan:** feature 51c (item 51, Staff statuses)
**Status:** verified

## Goal

A manager can suspend someone's access without taking them off the
schedule. A Suspended person can't sign in to the organization on web or
mobile, is signed out everywhere at once, and gets no push. Signing in shows a
calm "Access suspended" message instead of an error. Reinstate gives access
back. Suspended shows as their status wherever a status shows.

## Design reference

The "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo): Suspended pill, the
"Access suspended" sign-in message, Reinstate. Staff copy names only their
state and calls the product "the app" (owner decisions, 2026-10-26).
Confirmations follow the owner's dialog rules.

## Decisions

- Suspension is new columns, `employees.suspended_at` and `suspended_by`.
  The person stays `status = 'active'`, so they stay schedulable, keep their
  role and always take a seat. Only an active, unarchived person can be
  suspended; marking them away or archiving them ends the suspension.
- The JWT hook refuses a suspended person in the organization the token is
  for, with its own sentinel message, the way it refuses an archived one.
  Their other organizations are unaffected.
- Suspending signs them out everywhere (`endUserSessions`, which also
  rejects tokens already issued) and disables their push tokens for that
  organization. Reinstating clears the suspension; push comes back when the
  app registers its token again at the next sign-in.
- The web status route and the mobile status path take `suspend` and
  `reinstate`, with the self guard, the only-Super-Admin guard, and fresh
  proof for a Gridmaster to suspend (an access removal), as Archive has.
- 51c ships the access side and Reinstate. The Suspend dialog, the grid
  lock, the shift picker note, the notice email, the Super Admin alert and
  closing their requests are 51d.

## Build steps

- [x] **Step 1 - Migration 101.** `employees.suspended_at TIMESTAMPTZ`,
      `suspended_by UUID`; a CHECK that a suspended person is active and not
      archived, and the 099 guard clears suspension when they leave Active;
      the hook (copied from 037) refuses a suspended employee with
      `ACCOUNT_SUSPENDED_MESSAGE`. Checksum locked. _Done when:_
      `db:migrations:check` passes and a live test shows the hook refusing a
      suspended person, allowing them after reinstating, not affecting their
      other organization, and the guard clearing it on Mark away.
- [x] **Step 2 - Domain, types and routes.** `ACCOUNT_SUSPENDED_*` in
      `@dubgrid/domain`; `suspendedAt` on `Employee`, mappers, columns and
      the mobile contract; `describeEmploymentStatus` reads "Suspended";
      `suspend` and `reinstate` on the web route and the mobile path, which
      end sessions, disable push tokens, and audit `employee.suspended` and
      `employee.reinstated`. _Done when:_ route tests cover both actions, the
      guards, and the side effects.
- [x] **Step 3 - Sign-in message.** The web and mobile login (and the
      invitation sign-in) recognize the suspended sentinel and show "Access
      suspended". _Done when:_ route and component tests; screenshots.
- [x] **Step 4 - Pills and Reinstate.** Suspended pills on the web People
      list, record and Gridmaster, and the mobile People list and person
      page; a Reinstate action with its confirmation on web and mobile.
      _Done when:_ component tests; screenshots.

## Out of scope

- The Suspend dialog and everything else in 51d.
- Return dates, last day, bulk (51e to 51h).

## Testing

- Live integration test for migration 101 (BEGIN/ROLLBACK).
- Route, copy and component tests; screenshots.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`, `npm run db:migrations:check`, and
  `npm run db:migrations:rehearse -- --from 100`.

## Notes for the AI

- Copy the hook body verbatim from 037 and change only the suspension check
  and the columns it reads.
- Never sign anyone out with a client `signOut`; use `endUserSessions`.
- No person names in dialog messages or points; titles may name them.
