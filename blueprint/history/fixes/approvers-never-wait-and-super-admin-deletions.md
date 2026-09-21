# Approvers never wait: auto-approved shift requests, and account deletion becomes a super admin's decision

**Type:** Fix

**Status:** verified

## The problem

An admin holding `canApproveShiftRequests` (or a super admin) filed a
call-off, sent a swap, claimed or volunteered for a shift, and the request
landed in the same approval queue as everyone else's. Nobody else was told
when they were the only approver, so it waited until they approved their
own request from the queue. An app-wide audit of every approval-shaped flow
found one other gap: any admin with `canManageEmployees` could approve an
account deletion or delete directly, yet the request button was hidden for
them and no direct button existed, so managers and super admins had no
deletion path at all. The self-action lockout guards (own role, own
permissions, own staffing status) were confirmed as guards, not queues, and
left alone.

## The fix

- Shift requests: when a request enters `pending_approval`, if the
  requester or the person who just accepted or claimed it can approve shift
  requests, it is approved on the spot, attributed to that approver, with
  the note `Auto-approved: <name> can approve shift requests`. The
  counterparty still has to accept; only the manager step disappears. Any
  failure leaves the request in the queue exactly as before. Impersonation
  never settles anything (app skip plus a database refusal), and a call-off's
  system-authored child pickup does not inherit the absent person's rights.
  - Migration 030: `resolve_shift_request_unchecked` restated with a
    `p_admin_user_id` parameter (three hunks, proven by a text-equivalence
    test), a shared `_checked` wrapper for the 028 swap recheck, the public
    `resolve_shift_request` delegating with `auth.uid()`, and the new
    `auto_approve_shift_request(request_id)` RPC returning the approver and
    note or NULL. 030 is now the canonical resolver text.
  - `@dubgrid/data-access` `settleShiftRequestAfterTransition`, used by the
    web route directly and injected into `@dubgrid/mobile-api-core`.
  - Web and mobile create, claim, respond and volunteer responses carry
    `autoApproved`; the approver fan-out is guarded on a still-pending row;
    the requester's approved alert says who accepted instead of quoting
    them their own name.
  - `describeShiftRequestSubmitted` in `@dubgrid/domain` drives both
    platforms' toasts; mobile claim and call-off confirms tell an approver
    it goes on the schedule right away.
- Account deletion: only super admins (or gridmasters) decide it. Managers
  request it like any member and get the request card on web and mobile;
  reviewer notifications for deletions go to super admins only; the admin
  queues never list deletions to lower tiers; the server refuses a lower
  tier's decision; the mobile approve now requires fresh sensitive-action
  auth like the web queue; super admins get a direct "Delete account" card on
  web that states the sole-super-admin rule. The direct route's
  sole-super-admin count now ignores archived memberships. Migration 031
  restates the rule in the row-level update policy.

## Build steps

- [x] **1. Domain copy** - `describeShiftRequestSubmitted` with tests.
- [x] **2. Migration 030, SQL tests, inventory helper, checksums**.
- [x] **3. Integration test for the RPCs** - nine live-database cases.
- [x] **4. Shared helper** - `settleShiftRequestAfterTransition` with tests.
- [x] **5. Web route and notifications** - four branches, two guards, tests.
- [x] **6. Mobile API** - core handlers, contracts, route wrappers, tests.
- [x] **7. Web client toasts**.
- [x] **8. Mobile client toasts and confirm copy**.
- [x] **9. Account deletion server and routes**.
- [x] **10. Account deletion UI** - web card, mobile request gate.
- [x] **11. Migration 031 and its text test**.
- [x] **12. Docs**.

## Verify

- Worktree: type-check (24 tasks), lint (0 errors), `test:web` 4039 and
  `test:mobile` 1262 tests plus every package suite, all green, including
  the live-database integration test against the seeded local stack.
- A clean `supabase db reset` applies 030 and 031 in order.
- Live server on the worktree (Calm Haven): an approver's call-off returned
  `autoApproved: true`, the row was approved with the note and attribution,
  the grid showed the absence, no approver alert was created, and History
  showed the note. A regular member's call-off stayed pending and alerted
  seven approvers. An approver's swap settled the moment the regular
  recipient accepted, attributed to the approver, with the tailored alert.
- Deletion: a manager files a request (super admins alone notified), their
  admin list hides it, their approve returns 403; a Calm Haven super admin
  lists and approves it (fresh password login satisfied step-up). Web
  profile shows the request card to the manager and the direct card with the
  ownership rule to the super admin.

## Findings surfaced, not fixed here

Pre-existing, found by the live test; needs a schema decision:

- A call-off's vacated shift can never be claimed. Approving a call-off
  inserts an `open` child pickup and then cascade-cancels every active
  request on that employee and date, which matches the child it just created
  (`002_functions_triggers.sql` around line 5594-5625). Separately,
  `claim_shift_request` sets only `target_emp_id`, which violates
  `calloff_requires_absence_type` for any untargeted pickup, so the
  Available Shifts claim fails at the database. The 019/020 publish trigger
  only meets rows this path cannot produce. Suggested fix: one forward
  migration excluding `parent_request_id = p_request_id` from the cascade,
  a claim that also sets `target_shift_date` and the parent's
  `absence_type_id`, and a constraint that allows a claimed public pickup
  without an absence. Decide first whether a member's posted pickup should
  exist at all.

Follow-up decided with the user: a super-admin peer safety layer (step-up on
super-admin role changes and removals, peer notification, high-risk audit
entries, a tier guard on employment status changes, mobile session
revocation on removal, user-client role RPC calls, a recovery runbook).
