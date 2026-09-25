# Feature: Atomic rotation and recoverable delivery

**From build-plan:** feature 41a2
**Status:** all six steps verified, step 4 in three browsers; ready for review

## Goal

Re-issuing an invitation should be one deliberate act with one outcome. Today
changing a pending invitation's access revokes the row and inserts a
replacement, so the invitation changes identity mid-life, and the web surface
reaches that behaviour through a revoke-then-act path rather than a single
guarded confirmation. Rotate the token on the same pending invitation instead,
keep its email, role and departments, and keep the invitee from being stranded
when the email cannot be delivered.

## In scope

- Rotate in place: `replace_pending_invitation_access` keeps the same
  `invitations` row, issuing a fresh token and expiry rather than revoking the
  row and inserting a successor. The row keeps its email and departments, and
  takes the new role when one is asked for.
- One guarded confirmation for re-issuing or revoking an invitation, on every
  web surface that offers either, stating plainly that the existing link stops
  working immediately. `PendingInvitationBanner` already confirms both; the
  other three surfaces fire immediately, which is the real defect here.
- Delivery failure leaves a usable link. The existing restore path is kept
  working against the rotated row rather than a successor row.
- An invitee who already has an account with TOTP enrolled can accept without
  being offered a password-set flow and without weakening their second factor.
- Retry semantics are correct and consistent across every invitation endpoint:
  the right status code, and a `Retry-After` a client can act on.
- Revocation is durable. Found while settling the rotation contract: the resend
  path guarded nothing and cleared `revoked_at`, so resending a revoked
  invitation revived it with a fresh token and a fresh 72 hours. Proven with a
  failing test, then fixed. It matters more than the rotation itself, because
  three of the four surfaces that can resend do so without asking.

## Out of scope

- Recipient-facing copy for expiry, replacement and organization context (41a3),
  and the joined-date correction that rides with it.
- The authorization work finished in 41a1. The tier ceiling and inviter
  verification stay exactly as they are; this feature must not loosen either.
- Changing the fixed 72-hour absolute expiry. Rotation issues a fresh 72 hours
  from the moment of rotation, which is what the current replacement already
  does; the ceiling itself is not up for revision here.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - decide the rotation contract before changing it** - write down
      what in-place rotation does to the three things that currently depend on
      two rows: the `previous_invitation_id` the replace path returns, the
      `rollback_pending_invitation_access_replacement` RPC that restores the
      original by un-revoking it, and the audit trail, which today records a
      revoke and a create and would become one rotation against one resource id.
      _Done when:_ the contract is written into this spec's Data section and you
      have agreed it, because it changes what the audit log shows for a
      re-issue.
- [x] **Step 2 - rotate in place at the database layer** - one forward
      migration restating `replace_pending_invitation_access` to update the
      existing row's token, expiry and role rather than revoke and insert, and
      restating the rollback RPC to match. Keep the 41a1 inviter check and the
      tier ceiling exactly as they are. Lock the hash in `checksums.sha256`.
      _Done when:_ `npm run db:migrations:check` passes, and an integration test
      against the live database proves the row keeps its id, email and
      departments, takes the new role, carries a different token, and that the
      old token no longer accepts.
- [x] **Step 3 - carry the route and its restore path onto the rotated row** -
      update the replace-access route and its failure path to the new contract,
      including what it returns to the client. _Done when:_ a successful
      re-issue returns the same invitation id with a new token; a failed
      dispatch leaves the invitation pending on its previous usable token; and
      passing tests cover both.
- [x] **Step 4 - one guarded confirmation wherever an invitation is re-issued
      or revoked** - the plan describes replacing a revoke-first, second-modal
      flow. That is not what the code does. `PendingInvitationBanner` already
      asks once ("Reissue Invitation?" / "Revoke Invitation?"), while
      `MembersSection`, `ManagementStaffPanel` and `StaffDetailPage` each fire
      revoke or resend with no confirmation at all, and a pending invitation's
      role is replaced inline from a select with none either. So the work is to
      make the confirmed path the only path, reusing the banner's dialog rather
      than adding a second one. _Done when:_ every surface that re-issues or
      revokes asks once and names the consequence, no surface acts
      unconfirmed, and there is browser evidence: a screenshot of the
      confirmation and of the result on each surface, with no console errors.
      Code complete, evidence outstanding. One shared confirmation
      (`useInvitationActionConfirm`) is wired in, and the copy that described
      the old revoke-and-replace behaviour is corrected, since rotation revokes
      nothing. The gate is tested at the hook, where the contract lives. The
      per-surface browser evidence this step asks for cannot be produced in the
      cloud container, so per 41d it stays a blocker rather than a pass.
      Evidence, 2026-09-24, local: `e2e/invitation-reissue.spec.ts` passes
      15/15 in Chromium, Firefox and WebKit against this branch and migrations
      043 to 045. All five surfaces ask once, name the consequence, and change
      nothing when cancelled, with a screenshot of each confirmation and result
      and no console errors. The run found four defects, all fixed here (see
      "Found in the step 4 walkthrough"). The server ran without a Resend key,
      so a confirmed reissue exercised the failed-delivery restore. The
      delivered path is proven by the route and live-database tests; its
      browser and provider rehearsal belongs to 41d.
- [x] **Step 5 - a TOTP-enrolled invitee can accept** - establish what happens
      today when an invitee already has a DubGrid account with TOTP enrolled,
      then make acceptance work without offering them a password-set flow and
      without bypassing their factor. _Done when:_ the behaviour before and
      after is recorded, an enrolled invitee can accept, the accept path never
      sets a password for an account that already has one, and a passing test
      covers the branch.
      Outcome: no code change was needed, and the reason is recorded rather
      than assumed. Three things already hold. The register route returns
      `existing` for a confirmed account and never touches its password, which
      `register/route.test.ts` already asserts. Acceptance works for an enrolled
      caller whose challenge is still pending, proven against the live database.
      And the accept flow ends in a global sign-out, so the invitee
      re-authenticates through the login screen, which is the only place
      `MFAVerify` is rendered; `page.test.tsx` already asserts that sign-out.
      What was missing was a regression test for the middle one: nothing stopped
      a later migration gating acceptance behind AAL2 and silently breaking
      every enrolled invitee. That test now exists.
      Corrected 2026-09-24 (finding F-12): the database accepts, but the route
      never lets the call reach it. `requireAuthenticatedUser` refuses an
      enrolled aal1 token with `STEP_UP_REQUIRED`, and the page signs such an
      invitee in with the password alone, then reported the refusal as a dead
      link. The page now hands a step-up refusal to the login page's
      `MFAVerify` and resumes acceptance on the promoted session, and only the
      dead-token response is described as a dead link. Page and classifier
      tests cover it.
- [x] **Step 6 - correct and consistent retry semantics** - audit every
      invitation endpoint's throttled and unavailable responses. _Done when:_
      each returns the right status, every 429 carries a `Retry-After` in
      seconds, no 429 is returned for a non-throttling failure, and passing
      tests assert the header per endpoint.
      Outcome: one real defect. `/api/invitations/lookup` is unauthenticated
      and answers with organization context, and the abuse-boundary contract
      declares it source-limited, but the route had no limit and nothing
      enforced the contract. It has one now. Everything else was already
      correct: each 429 carried a `Retry-After`, and a limiter that cannot
      answer returns 503 rather than pretending to be a throttle. What was
      missing was assertions, so the invitations route and `send-invite-email`
      now have throttle tests too.
      Corrected 2026-09-24 (finding F-27): not everything was correct. Most
      routes sent `Math.ceil(reset / 1000)`, and `reset` is an epoch in
      milliseconds, so a 429 advertised a wait of about 56 years. The tests
      asserted only a positive integer, which the epoch satisfies. One
      `retryAfterSeconds` helper now serves all 33 routes, and the throttle
      tests bound the value by the window.

## Files / areas

- `supabase/migrations/044_*.sql` (next free number; 043 is taken) plus
  `supabase/migrations/checksums.sha256`.
- `supabase/migrations/045_invitation_rollback_restores_access.sql`: the
  restore puts back the whole previous grant, not only the link.
- `apps/web/src/app/api/organizations/invitations/route.ts` - the replace-access
  path, its restore path, and the throttled responses.
- `apps/web/src/components/staff/PendingInvitationBanner.tsx` - the one surface
  that already confirms; its dialog is the pattern the others adopt.
- `apps/web/src/components/staff/MembersSection.tsx`,
  `apps/web/src/components/staff/ManagementStaffPanel.tsx` and
  `apps/web/src/components/staff-detail/StaffDetailPage.tsx` - the surfaces that
  revoke or resend without asking.
- `apps/web/src/features/organization/client/access.ts` - the client call.
- `apps/web/src/app/api/invitations/register/route.ts` and the accept-invite
  page - the TOTP branch.
- Tests beside each route, plus
  `apps/web/src/__tests__/invitation-inviter-verified.integration.test.ts` or a
  sibling for the rotation behaviour.

## Data / contracts

**The settled contract.** Rotation is not a new mechanism: the resend path
already rotates in place, updating `token` and `expires_at` on the same row
under an optimistic `updated_at` check, and restoring the previous pair when
dispatch fails. Replace-access adopts that same shape and adds the role change,
so there is one way to re-issue an invitation rather than two.

It keeps going through `replace_pending_invitation_access` rather than becoming
a direct update, because that RPC is where 41a1 put the inviter verification and
the tier ceiling. A direct update would move a role change outside the database
check that refuses a lower tier, which this feature must not do.

- `invitations.token`, `expires_at` and `role_to_assign` become mutable on a
  pending row, where today a re-issue replaces the row. The row id becomes
  stable across a re-issue, which is the point: one invitation, one identity.
- `previous_invitation_id` goes away rather than returning the row's own id: it
  would be a lie with one row, and the route only uses it to relate the audit
  entry to a successor that no longer exists.
- The rollback RPC restores the previous token and expiry on the same row,
  matching what the resend failure path already does, instead of un-revoking an
  original and revoking a successor.
- `replace_pending_invitation_access` keeps its signature. Its returned
  `previous_invitation_id` has no meaning once nothing is replaced, so Step 1
  decides whether it goes or returns the same id.
- `rollback_pending_invitation_access_replacement` currently un-revokes the
  original and revokes the successor. With one row it restores the previous
  token and expiry instead, so it needs restating in the same migration.
- The audit trail for a re-issue becomes one `invitation.access_replaced` entry
  against a stable resource id, where today it is a revoke plus a create. This
  is a visible change to what an administrator reads in the log.
- Schema changes are new numbered forward migrations with the hash locked in
  `checksums.sha256`.

## Testing

Vitest and Playwright are configured, so the testing gate is on: every step
above ships a passing test in the same diff.

Logic that needs a test: the rotation RPC and the rollback RPC with the routes
bypassed, the replace-access route and its failure path, the TOTP accept branch,
and the `Retry-After` on each throttled endpoint.

Step 4 is the only step whose done-when needs a running app. It cannot be proven
in the cloud container, which has no Supabase stack: that evidence comes from a
local run or CI, and per 41d an absent runtime check is a blocker rather than a
pass.

## Step 4 test script

Now automated as `e2e/invitation-reissue.spec.ts`; the manual script stays for
a human walkthrough. Two corrections, found running it locally:

- Invitation emails are sent through Resend, not caught by Inbucket. With a
  `RESEND_API_KEY` set, every reissue sends real mail; without one, delivery
  fails and the previous link must stay live. Use an address you own, or run
  without the key to walk the failure path.
- `npx supabase migration up --local` applies 043 to 045 without wiping local
  data; `db:reset` also works but reseeds everything.

Follow it in order. Each step says what to do, what to expect, and what a
failure means. Branch `claude/lucid-hopper-exfpqt`.

### 0. Start the stack

    git fetch origin
    git checkout claude/lucid-hopper-exfpqt
    npm ci
    npm run build:packages
    npm run db:reset
    npm run dev

No trailing comments on those lines: interactive zsh does not treat `#` as a
comment unless `interactive_comments` is set, so a pasted `npm run dev # url`
hands the url to turbo as a task name and fails.

`db:reset` is not optional. Migration 044 changes both invitation RPCs, so an
older local database silently tests the old code path.

Three local URLs matter:

| What                                      | Where                  |
| ----------------------------------------- | ---------------------- |
| The app                                   | http://localhost:3000  |
| Supabase Studio                           | http://127.0.0.1:54323 |
| Inbucket, which catches every local email | http://127.0.0.1:54324 |

This helper prints the state that matters after each step. Keep it to hand:

    alias inv='psql postgres://postgres:postgres@127.0.0.1:54322/postgres -x -c "select id, email, role_to_assign, token, expires_at, revoked_at, accepted_at from invitations order by updated_at desc limit 3;"'

### 1. Create the invitation under test

Sign in as a super admin, go to People, and invite a new address. Open
Inbucket, open the invitation email, and **copy the accept link**. Keep it: most
of what follows is about whether that link still works.

Run `inv`. Expect one pending row: your address, `revoked_at` and `accepted_at`
both null. Note its `id` and `token`.

### 2. Each surface must ask before it acts

Five places offer these actions. For each: click, read the dialog, then
**cancel**, and confirm nothing happened.

1. People, management panel, **Resend** on the pending row. Expect "Reissue
   Invitation?" saying their current link stops working immediately.
2. Same panel, **Revoke**. Expect "Revoke Invitation?" saying the link stops
   working and that a new invitation can be sent later.
3. The person's detail page, **Revoke**.
4. The pending-invitation banner, **Reinvite**, then **Revoke**.
5. The pending row's role select: pick a different role. Expect "Change
   invitation access?", a confirm button reading "Change and resend", and the
   message naming the address the new link goes to.

After cancelling each one, run `inv`. The `token` must be unchanged every time.
A changed token means the surface acted before asking, which is the defect this
step exists to close.

### 3. Reissuing kills the old link

Reissue for real: confirm the dialog at surface 1. Then

- run `inv`: same `id` as step 1, a **different** `token`, `expires_at` about 72
  hours out, `revoked_at` still null. Same invitation, new link.
- open Inbucket: a new email with a new link.
- paste the **step 1** link into a browser. It must be refused as no longer
  valid.
- follow the **new** link. It must reach the accept page.

A working old link means rotation did not take effect, and the most likely
cause is a database that was not reset.

### 4. Revoking holds

Do not accept the invitation. Revoke it from surface 2, confirming the dialog.
Then

- run `inv`: `revoked_at` is set.
- try **Resend** on that person, if the control is still offered. It must
  refuse, and `inv` must still show `revoked_at` set with the same `token`.
- paste the most recent link. It must be refused.

A resend that clears `revoked_at` or issues a fresh token is the revival defect
returning, and it is the one worth catching here.

### 5. Change access, and read the trail

Invite a second address. From the role select, change its role and confirm.
Then

- run `inv`: same `id`, new `token`, and the new `role_to_assign`.
- in Studio's SQL editor:

      select action, resource_id, details, created_at
      from audit_log
      where resource_type = 'invitation'
      order by created_at desc
      limit 10;

Expect **one** `invitation.access_replaced` row for that change, against the
same invitation id. Two rows, a revoke plus a create, would mean the old
two-row behaviour is still live.

### 6. Report

Keep the browser console open throughout: any error counts as a failure. Tell
me which numbered step failed and what you saw, and I will fix it. If all six
pass, step 4 is done and 41a2 is complete.

Commands: `npm run type-check`, `npm run test:web`, `npm run lint`,
`npm run db:migrations:check`, and `npm run test:e2e` for Step 4.

## The local Postgres rig, and the trap in it

Steps 2, 3 and 5 were verified against a real database, built directly in the
container because there is no Docker daemon or Supabase CLI: a Postgres 16
cluster on port 54322 with a small stand-in for the Supabase surface the
migrations use. It is worth having; it is how the rotation, the inviter checks
and the enrolled-invitee case were proven on real SQL rather than mocks.

**Stop it before any full-suite run.** The pre-existing `*.integration.test.ts`
files probe that port and skip when nothing answers, which is what they do in
CI. With the rig up they execute instead, against a shim that is unseeded and
not a Supabase replica, and they fail for environmental reasons. That produced
three full-suite results today that were not comparable to each other, visible
in the skip counts: 3 skipped with the rig up against 17 with it down. Only the
rig-down run means anything, and it passed: 20/20 tasks, 4202 tests, no
failures.

    pg_ctl -D /var/lib/postgresql/verify stop   # before npm run test:web
    pg_ctl -D /var/lib/postgresql/verify -o '-p 54322' start   # for the rig

## Found in the step 4 walkthrough

**Two dialogs for one click, on the detail panel's Reinvite.** Reported from
step 7 of the script. The banner asks "Reissue Invitation?", then calls
`handleReinvite`, which calls `onRevoke` to clear the old invitation, and that
function had been wrapped in the shared confirmation, so it asked again. Fixed
by not wrapping it: the banner is its only caller and the banner already asks.
The wrapper stays on the management panel's revoke and resend, which have no
dialog of their own.

**The detail panel's Reinvite is still revoke-then-create, not rotation.** Fixed
2026-09-24: the same handler lived on three surfaces (the detail slideover, the
full detail page, and an unreachable copy in `EditEmployeePanel`), and all three
now call the resend path. The original note, for the record: open,
and the more interesting finding. `StaffDetailPanel.handleReinvite`
(`StaffDetailPanel.tsx:152`) revokes the pending invitation and then opens the
invite modal to create a new one, so on that surface a reissue still mints a
second invitation rather than rotating the first. That is the exact flow the
plan called "revoke-first", which earlier reading of the code had missed
because the revoke and the create are two calls in a handler rather than one
dialog naming both. Rotation should be reachable from here too, which means
pointing this handler at the resend path instead of revoke-plus-invite. It is a
behavioural change on a surface the script is still walking, so it is recorded
rather than done in the middle of a test run.

**The management panel asked twice to revoke.** Fixed 2026-09-24. Its inline
"Revoke this invitation?" strip ran before the shared dialog, so one revoke
took two prompts, and the strip did not say a resend will not restore the link.
The panel now hands straight to the shared dialog, and cancelling it no longer
closes the panel. Inline confirmations are not used anywhere on web.

**A failed access change kept the new access.** Fixed 2026-09-24 in migration 045. 044's restore put back only the token and expiry, so when the replacement
email failed, the invitee's still-valid old link carried the new role, inviter
and departments while the admin was told nothing changed. The two-row design
had restored everything by un-revoking the original. The rotation now returns
the whole previous grant and the restore applies it, on web and in the three
mobile routes.

**A live-database test assumed an empty table.** "rotates in place" counted
every invitation, which holds only on the unseeded rig and fails on any seeded
database, including CI's integration job. It now counts its own organization's.

## Raised for 41b, not fixed here

Superseded 2026-09-24: this reading was wrong. The route already demands the
second factor from an enrolled invitee (see the Step 5 correction), and the page
now presents the challenge, so there is nothing left to decide here for 41b.
The original note follows.

Accepting an organization invitation needs only the invitee's password, never
their second factor, even when they have TOTP enrolled. That is a deliberate
consequence of the flow above and it is not a defect in 41a2's terms, but
joining an organization is a privilege grant, and 41b is the item about
requiring fresh assurance for sensitive actions. Whether acceptance should
demand AAL2 from an enrolled user is a decision for that item, with the
trade-off that demanding it inside this flow means presenting a challenge the
page does not have today.

## Notes for the AI

- The restore-on-failure behaviour 41a2 asks for already exists and is tested
  (`route.test.ts`: "restores the old invite when the replacement email cannot
  be sent" and "restores the previous token and expiry when a resend email
  cannot be delivered"). This feature moves it onto the rotated row; it does not
  build it from nothing.
- Do not loosen anything 41a1 established. `inviter_may_grant` and the
  `canAssignOrgRole` ceiling must still refuse a lower tier, and the rotation
  migration restates functions that carry those checks, so they must be carried
  forward verbatim.
- The rotation is the same class of change as the one 41a1 made to
  `send_invitation`: restate the function in a new forward migration, never edit
  an applied file, and lock the hash.
- Keep `getServiceClient()` for the writes; authorize the caller first.
- Scope every read and write by the effective sandbox-aware `orgId`.
- No em dashes in code, comments, or commit messages.
