# Feature: Atomic rotation and recoverable delivery

**From build-plan:** feature 41a2
**Status:** verified

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

## Findings

### 41a2/F-03 [P2] closed - Deleting a long series reads only its first 1,000 cells, orphaning shift notes

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1484`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: performance)
**Why it matters:** The read of a series' cells before `delete_shift_series` is unpaged, and `db.max_rows = 1000` (`supabase/config.toml:18`) applies to every role including `service_role`. The rows feed `clearScheduleNotesForCells`, and `schedule_notes` has no foreign key to the cell, so notes on cells past the first 1,000 survive the deletion and render an indicator against a shift that no longer exists. This is the same class as the already-repaired F-11 truncation, and it violates the standing rule that every shift-removal path clears notes. Only reachable while F-02 stands, since 183 occurrences cannot cross the cap; it is recorded separately because raising the legitimate series ceiling would reintroduce it even after F-02 is clamped.
**Suggested fix:** Page the read with `.range` in a deterministic order, reusing the pager shape already used by `fetchNormalizedPublishedShiftRows` and `fetchScheduleCellQueryRows`.
**Resolution:** Fixed on `dev` in `c8e2316e`. The series cell read now goes through `fetchAllRows` in a stable date/id order, the pager the schedule reads use. A route test serves the cells capped at `max_rows` and proves notes on all 1,203 cells of a long series are cleared. It and the existing series test fail on the old unpaged read. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): re-read the paged series read in `schedule/manage/route.ts`: `fetchAllRows` over a stable date/id order, and every cell reaches `clearScheduleNotesForCells`. No new defect.

### 41a2/F-05 [P3] closed - Six integration claim builders hardcode the enrollment claim with no override

**File:** `apps/web/src/__tests__/draft-state-editor-only.integration.test.ts:124` and the same `asUser` helper in `row-level-trust-boundaries`, `employee-contact-columns`, `auto-approve-shift-requests`, `schedule-children-org-consistency` and `role-escalation-guards`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: tests)
**Why it matters:** The F-01 repair added `mfa_enrolled: false` to each of these literal claim objects, which is right (it is what a real token carries) but fixed: unlike `org-isolation`, whose setter spreads `{ mfa_enrolled: false, ...claims }` so a test can override it, these six cannot express an enrolled caller at all. Any future case in those files that wants to prove a policy refuses an unchallenged enrolled member has to edit the shared helper first, which is the kind of friction that ends in the case not being written.
**Suggested fix:** Give each `asUser` an optional claims override merged the way `org-isolation` does, or lift one shared helper into `__tests__/helpers/` and have all seven use it.
**Resolution:** Fixed on `dev` in `099847e8`. `__tests__/helpers/simulated-jwt.ts` sets the simulated token for all seven suites, plus `shift-series-bounds`. It defaults `mfa_enrolled: false` as a real token carries it, and every `asUser` takes an optional claims override. A new live-database case proves an enrolled member at aal1 sees none of their organization's staff until aal2. All nine suites passed against the seeded local database with nothing skipped. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): all seven named suites and `shift-series-bounds` use `helpers/simulated-jwt.ts`, and each `asUser` accepts an override. The new enrolled-caller case ran against the live database. No new defect.

### 41a2/F-06 [P3] closed - change_user_role runs under the service role, so its own tier guards never fire

**File:** `apps/web/src/app/api/organizations/access/route.ts:276`; `packages/data-access/src/mobile.ts:1693`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security)
**Why it matters:** Both callers invoke the RPC with the service client, which has no `auth.uid()`, so the RPC's identity, caller-tier and admin-tier checks pass vacuously. This is documented at `packages/data-access/src/mobile.ts:1677` and the compensating application checks are real and were verified in this pass: the web route gates on `isGridmaster || isSuperAdmin` (`requirePrivilegedActor`), and the mobile gate's `canManageUsers` resolves to `isSuperAdmin || isGridmaster` and is false under impersonation (`packages/authz/src/index.ts:273`). So this is not currently exploitable and is recorded as defence in depth only: the database layer would not catch a future route whose gate drifted below super admin.
**Suggested fix:** Call the RPC with the user client at both sites so both layers are live, as the already-decided follow-up in the archived plan describes. The guards that do not read `auth.uid()` (expected-updated-at, self-action, last-super-admin) are unaffected either way.
**Resolution:** Fixed on `dev` in `2fc2e69e`. The web access route and both mobile routes (`person-org-role`, `person-management-access`) now call `change_user_role` with the caller's client, so the RPC's identity, membership and tier guards run alongside the unchanged route gates. A Test Sandbox actor is a super admin of the sandbox, and `authenticated` may execute the RPC (016), so admitted callers still pass. Route tests assert the caller's client is used and never the service client. `role-escalation-guards` covers the RPC's guards for an authenticated caller against the live database. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the web access route and both mobile routes call `change_user_role` on the caller's client. Admitted callers still hold a membership the RPC accepts: a Test Sandbox actor is inserted as super admin, and `authenticated` may execute the RPC (016). No new defect.

### 41a2/F-07 [P3] closed - Consumed invitation links show the acceptance form before failing

**File:** `apps/web/src/app/(app)/accept-invite/page.tsx:68`
**Found:** 2026-09-23 by focused source review (scope: invitation acceptance; lens: quality)
**Why it matters:** The initial invitation lookup correctly rejects accepted, expired, revoked, and unknown tokens with the same opaque response, but the page treats that failure as best-effort and still shows the account-creation form. A person using a consumed link can fill the form before learning that the invitation is no longer valid.
**Suggested fix:** Render the generic invalid-invitation state as soon as lookup returns the dead-invitation contract, while preserving indistinguishable messaging for accepted, expired, revoked, and unknown tokens. Add page coverage proving the form never appears for a dead token.
**Resolution:** Fixed on `dev` in `cfa5b088`. The accept page waits for the invitation lookup before rendering anything. The dead-token response shows one "Invitation no longer valid" state, identical for accepted, expired, revoked and unknown links, with a sign-in route. A lookup outage still shows the form, since acceptance re-checks the token. Page tests cover all three outcomes, and the three-browser E2E opens a revoked link (no form) and a live one. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the page waits for the lookup and shows the dead-invitation state only for the opaque dead-token code. An outage still shows the form, and acceptance re-checks the token. No new defect.

### 41a2/F-08 [P0] closed - An employee-managing admin can promote a pending invitation to Super Admin

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:31`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: security)
**Why it matters:** `PATCH` accepts `roleToAssign: "super_admin"`, but its only authorization is `requirePrivilegedActor`, which deliberately admits a regular admin with `canManageEmployees` (`route.ts:87`). The service-role update at `route.ts:387` rewrites `role_to_assign` without changing `invited_by`. If the pending invitation was originally created by a still-active Super Admin or Gridmaster (mobile-created rows do preserve that inviter), the acceptance guard at `supabase/migrations/033_row_level_trust_boundaries.sql:149` sees the old privileged inviter and grants the recipient Super Admin. A regular admin can therefore cross the tenant's highest privilege boundary with a crafted PATCH request.
**Suggested fix:** Require a live Super Admin or Gridmaster for every transition to `super_admin`, including PATCH and `replace_access`; enforce the same invariant in the database operation rather than relying only on the route; and add negative regular-admin tests plus positive Super Admin/Gridmaster acceptance tests.
**Resolution:** Fixed in 41a1, merged to `dev` in PR #104. The super-admin ceiling now applies to `PATCH` and `replace_access` through the shared `canAssignOrgRole` check (`1f648ec5`, `efb29875`), and migration 043 enforces it in the database via `inviter_may_grant`, so the route is not the only guard. Refusals are audited. Negative regular-admin and positive Super Admin tests cover both paths. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): `canAssignOrgRole` gates PATCH (`invitations/route.ts`), `replace_access` and create, and 043/045 carry `inviter_may_grant` into the database. No new defect.

### 41a2/F-09 [P1] closed - Web-created Super Admin invitations have no inviter and can never be accepted

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:159`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: security)
**Why it matters:** The web route invokes `send_invitation` with the stateless service client and no inviter argument. The RPC writes `invited_by = auth.uid()` (`supabase/migrations/002_functions_triggers.sql:2841`), which is `NULL` under service role, while acceptance requires a still-privileged inviter for `super_admin` (`supabase/migrations/033_row_level_trust_boundaries.sql:149`). Live production inspection on 2026-09-24 found recent, time-valid Super Admin invitation rows with `invited_by = NULL`; they fail with the same opaque `INVITATION_INVALID` response used for expiry, even seconds after sending.
**Suggested fix:** Forward-migrate the RPC to require an explicit authenticated inviter, validate that actor's live tier, pass `user.id` from the route, and reissue affected live invitations after the fix. Add a service-role create-then-accept integration test.
**Resolution:** Fixed in 41a1, merged in PR #104. Migration 043 gives `send_invitation` an explicit inviter that it verifies against live membership and tier, and the create route passes the authenticated caller. A create-then-accept integration test covers every tier. Invitations already in production with `invited_by = NULL` still fail closed, and reissuing them is a release step for 41a3/41d. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): create passes `p_invited_by: user.id` to `send_invitation`, and the RPC verifies it. No new defect.

### 41a2/F-10 [P1] closed - Invitation token rotation and email delivery are inconsistent across web and mobile

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:38`; `apps/web/src/features/mobile/server/routes/person-invitation.ts:409`; `apps/web/src/features/mobile/server/routes/management-user-invitation.ts:79`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: quality and security)
**Why it matters:** Duplicate web creation rotates the live token before the client separately sends email (`InviteEmployeeModal.tsx:243`), so every retry invalidates earlier mail and a delivery failure strands the recipient. Mobile staff resend does the reverse—emails the token before the optimistic database commit—so a conflict can deliver a token that was never stored. Management resend and same-role management-access edits commit a new token before email without restoring the previous row on failure (`person-management-access.ts:217`). Organization setup swallows delivery errors but increments `sentCount` (`components/gridmaster/organization-setup/persistence.ts:391`). These are independent ways for a link to appear "expired" immediately, and repeated invites amplify the problem.
**Suggested fix:** Consolidate every create/resend/access-change path on one idempotent server primitive or durable outbox that activates exactly the token known to have been delivered, with guarded compensation for ambiguous provider failures. Preserve the last delivered token until the replacement is committed and add concurrency, timeout, and provider-failure tests for every caller.
**Resolution:** Fixed on `dev`. Every create, resend and access-change path now stores its link and emails it as one operation, and undoes what it changed if the email fails: 41a2 rotation in place with the whole grant restored (migrations 044 and 045); the web create route sending in the same request, removing a new invitation or restoring a refreshed one, with `/api/send-invite-email` removed (`bf9c8775`); Gridmaster setup sending the super admin's invitation at creation and counting only real sends (`bf9c8775`); and the three mobile resend and access paths storing first and restoring the previous link and departments on failure, with the refresh helper no longer reviving revoked rows (`375026de`). Route, component, live-database and three-browser E2E tests cover each path. Ambiguous provider failures (a send that timed out but was delivered) still resolve by removing or restoring, so such an invitee holds a dead link and needs a resend. **Still fixed, not closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses). The link-consistency defect is gone on every path re-examined (web create/resend/replace, Gridmaster setup, all three mobile paths). The rotation, though, still dispatches `invitation_revoked` and `invitation_created` alerts, which is F-28. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): F-28, the defect its rotation introduced, is repaired and closed in this pass. The invitation route and create route were re-read, and every path still stores and emails one link and restores it on failure. No new defect.

### 41a2/F-11 [P1] closed - Regular admins can create invitations but are categorically blocked from emailing them

**File:** `apps/web/src/app/api/send-invite-email/route.ts:72`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: authorization)
**Why it matters:** Invitation creation explicitly allows a regular admin with `canManageEmployees` (`organizations/invitations/create/route.ts:134`), but the separate email endpoint admits only a Super Admin or Gridmaster. The UI creates the database row first, then deterministically receives 403 while sending the email, leaving an unsent pending invitation that retrying cannot fix.
**Suggested fix:** Authorize delivery with the same live organization permission used for creation while retaining the separate Super Admin assignment guard. Prefer the single create-and-deliver operation required by F-10 so the two checks cannot drift again.
**Resolution:** Fixed in 41a1, merged in PR #104 (`71490b44`). `send-invite-email` now authorizes on the same organization permission as creation, keeping the organization-scope check, and the Super Admin assignment guard is unchanged. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): `/api/send-invite-email` is removed. Delivery happens inside create under create's own authorization. No new defect.

### 41a2/F-12 [P1] closed - Existing MFA users cannot accept a new organization invitation

**File:** `apps/web/src/app/(app)/accept-invite/page.tsx:126`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: quality and security)
**Why it matters:** The invitation page signs an existing account in with password and immediately calls the acceptance route, but it has no TOTP challenge or handoff. `requireAuthenticatedUser` correctly rejects an enrolled AAL1 token with `STEP_UP_REQUIRED` (`apps/web/src/lib/api-auth.ts:168`); the page then rewrites that policy response as "this invitation is no longer valid" and tells the user an account was created. MFA-enrolled clients are therefore unable to join another organization and receive a false expiry diagnosis.
**Suggested fix:** Reuse the normal login MFA challenge, preserve the invitation token through the handoff, continue acceptance only with the promoted session, and distinguish policy/network failures from the opaque dead-token contract. Add an existing-MFA-account end-to-end case.
**Resolution:** Fixed in 41a2 on `claude/lucid-hopper-exfpqt` (`7891f0a0`). The accept page hands a `STEP_UP_REQUIRED` refusal to the login page's `MFAVerify` and resumes acceptance on the promoted session. Backing out signs the password-only session out. Only the dead-token response is described as a dead link. Page, classifier, and three-browser E2E runs cover it; an existing-MFA-account browser case against a real factor remains for 41d. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): `classifyAcceptFailure` separates step-up from dead-token failures. A step-up hands off to `MFAVerify`, acceptance resumes on the promoted session, and cancelling signs the password-only session out. No new defect.

### 41a2/F-13 [P1] closed - Mobile session termination bypasses DubGrid revocation and bulk assurance

**File:** `apps/mobile/src/features/profile/screens/ProfileSessionsScreen.tsx:116`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** Mobile logout, other/all-device sign-out, password change, password recovery, and forced teardown call the Supabase SDK directly. DubGrid verifies mobile JWTs locally and therefore relies on application revocation markers (`apps/web/src/features/mobile/server/auth.ts:63`); the web sign-out route explicitly documents that provider sign-out alone leaves copied access tokens valid until expiry (`apps/web/src/app/api/auth/sign-out/route.ts:41`). Mobile's bulk actions also skip the step-up used by per-device revoke. The UI can claim devices are signed out while their JWTs and `user_sessions` rows remain accepted, and a stolen unlocked session can trigger bulk sign-out without fresh proof.
**Suggested fix:** Add a bearer-authenticated mobile equivalent of `/api/auth/sign-out` for local/others/global scopes, write the app revocation markers before client cleanup, retain fresh assurance for bulk scopes, and allow the existing recovery-proof exception only for password recovery completion.
**Resolution:** Fixed on `dev` in `d2e760fc`. `POST /api/mobile/v1/auth/sign-out` is the bearer twin of the web route and shares its revocation logic (`lib/auth/session-sign-out.ts`). Mobile logout, forced teardown, other-device and every-device sign-out, and the password change now write DubGrid's revocation markers before the device drops its tokens. Bulk scopes require the step-up and credential-assurance preflight, so a cancelled confirmation changes nothing. Only a password-recovery completion may use a fresh OTP proof instead, checked against a live, unrevoked user. Route, screen and teardown-order tests cover each path, and both boundary inventories classify the endpoint. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): local sign-out writes the session marker on web and mobile. Bulk scopes need sensitive assurance, end provider sessions and write markers. Recovery completion needs a live, unrevoked user with fresh OTP proof. No new defect.

### 41a2/F-14 [P1] closed - Mobile sign-in email changes bypass fresh credential assurance

**File:** `apps/mobile/src/features/profile/screens/ProfileWorkScreen.tsx:353`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** Mobile calls `auth.updateUser({ email })` directly and can persist related name/work edits first. Web correctly runs the equivalent account-wide mutation through step-up and the five-minute credential-assurance preflight (`apps/web/src/components/account/ProfilePanel.tsx:485`). Anyone holding an unlocked mobile session can initiate a global sign-in-email change without password/TOTP confirmation, and the current-organization profile screen does not explain that the change affects every organization.
**Suggested fix:** Gate the whole email-changing save with `useMobileStepUpAction` and `requireMobileCredentialAssurance` before any write, then make the confirmation copy explicitly say it changes the DubGrid account across all organizations.
**Resolution:** Fixed on `dev` in `227e5e02`. An email-changing save runs through `useMobileStepUpAction`, and `requireMobileCredentialAssurance` runs before any write, including the name and work edits. The confirmation now says the change applies to every organization. Tests prove that a refused identity check writes nothing and that the assurance runs first. They fail on the old screen. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the email-changing save runs `requireMobileCredentialAssurance` inside the step-up action before any write, and the copy says the change applies to every organization. No new defect.

### 41a2/F-15 [P1] closed - Password-reset partial failures lose the mutation commit state

**File:** `apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx:136`; `apps/web/src/app/(app)/reset-password/page.tsx:168`
**Found:** 2026-09-24 by `/audit` (scope: password recovery; lens: security and quality)
**Why it matters:** Mobile races the provider password update against a non-cancelling 15-second deadline, sets `passwordUpdated` only when the race resolves, and revokes sessions afterward. A late provider success therefore changes the password but skips revocation and re-enables a blind retry. Web changes the password first, then performs global recovery completion in the same `try`; if revocation fails, it falsely says the password could not be updated even though `completeBrowserPasswordRecovery` has already cleared the local recovery session. Both flows lose the point at which the irreversible mutation may have committed.
**Suggested fix:** Move recovery completion behind an idempotent server operation/state machine or explicitly reconcile ambiguous late settlement. Once a password update has or may have committed, never show a password-update retry; complete/best-effort revocation, sign out locally, and tell the user to sign in with the new password and review sessions. Add late-settlement and post-update revocation-failure tests.
**Resolution:** Fixed on `dev` in `9cc98d9f`. Web and mobile share `mayHavePasswordUpdateCommitted` (`@dubgrid/client-errors`): a deadline, lost response or provider failure counts as possibly applied. Either way the flow finishes: best-effort global revocation, local sign-out, and a message to sign in with the new password. Only a definite rejection keeps the form. A web revocation failure now reports a changed password rather than a failed update. Mobile recovery revocation goes through the DubGrid sign-out endpoint, using the token from the OTP verification. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): a possibly committed update never re-offers the form on web or mobile, and revocation failure reports a changed password. No new defect.

### 41a2/F-16 [P1] closed - Auth deletion failure leaves self-delete and GDPR erasure non-retryable

**File:** `apps/web/src/app/api/auth/delete-account/route.ts:125`; `apps/web/src/app/api/auth/gdpr-erase/route.ts:105`
**Found:** 2026-09-24 by `/audit` (scope: account lifecycle; lens: security and privacy)
**Why it matters:** Both endpoints remove memberships/application data before `auth.admin.deleteUser`. If the final Auth deletion transiently fails, the identity remains but its membership has gone; the next request fails the live `canDeleteAccountDirectly` check before it can retry the Auth deletion. The user is left with a valid identity that cannot complete its own deletion, after destructive cleanup has already occurred.
**Suggested fix:** Use an idempotent deletion saga with a durable retry record created before cleanup, or a carefully designed auth-first/tombstone flow that guarantees remaining cleanup can resume. Add failure injection followed by a successful retry for both endpoints.
**Resolution:** Fixed on `dev` in `1bbf4abd`. After every gate passes, each route writes a durable `account.deletion_started` or `gdpr.erasure_started` audit record, and refuses to start if it can't. A retry by the same user resumes from that record without the membership-based permission check. The confirmation, the Gridmaster block and the sole-super-admin guard are still re-checked. Both cleanup sequences are idempotent. The tests inject the Auth failure and resume after the membership is gone, and they fail on the old routes. Not covered: an abandoned partial deletion has no automatic sweep, so it waits for the user's retry. **Still fixed, not closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses). The partial-failure lockout is gone, but the resume record the repair introduced never expires. That is F-31. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): F-31, the defect its resume record introduced, is repaired and closed in this pass. `self-deletion.ts` and both routes were re-read. No new defect.

### 41a2/F-17 [P1] closed - Mobile app lock fails open while SecureStore hydrates

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:89`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** The persisted lock snapshot starts as `false`, hydration is asynchronous, the provider starts unlocked, and protected children always render. Startup readiness does not wait for lock hydration. A delayed, hung, or rejected SecureStore read can therefore lift the splash and expose authenticated content even though the user enabled app lock.
**Suggested fix:** Model the setting as `loading | enabled | disabled`, keep an opaque authenticated gate up until hydration resolves, handle read failure explicitly, and include lock readiness in startup release. Add delayed/rejected SecureStore cold-start tests and native-device snapshot checks.
**Resolution:** Fixed on `dev` in `4f6fdabe`. The lock setting is `loading | enabled | disabled | unreadable`, with a 5-second read deadline. The lock screen shows while loading and on an unreadable setting. Startup waits for the lock state while signed in. Tests cover delayed, rejected and hung SecureStore reads. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): `loading` shows a cover, `unreadable` is treated as locked, and a device without biometrics is not stranded. No new defect.

### 41a2/F-18 [P1] closed - A stale mobile request can sign out a newer valid session

**File:** `apps/mobile/src/shared/lib/api.ts:126`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: concurrency)
**Why it matters:** Each request captures a bearer token, but any later 401 invokes a callback that discards the originating token and calls global auth teardown. Same-identity refresh deliberately leaves in-flight requests mounted, so a delayed 401 for token A after token B has been installed signs out whichever session is current, clears app state, and routes a valid user to login.
**Suggested fix:** Carry the request token/session identity into the failure handler, re-read the live session, and tear down only if it still matches. A stale request should fail locally without clearing newer auth state. Add refresh/org-switch races where the old request returns 401 last.
**Resolution:** Fixed on `dev` in `aeb6aed4`. Each request carries its bearer into the failure handler. `handleRejectedMobileToken` tears down only when the rejected token is still the live session's, so a stale request's late 401 fails on its own. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): `handleRejectedMobileToken` tears down only when the rejected token is the live one. No new defect.

### 41a2/F-19 [P1] closed - New-sign-in and MFA security alerts can be systematically missed

**File:** `apps/web/src/app/api/auth/track-session/route.ts:47`
**Found:** 2026-09-24 by `/audit` (scope: authentication notifications; lens: security)
**Why it matters:** Web decides "new device" using only `(user_id, platform, device_label)`, but common labels collapse every Mac to `Macintosh` and every Windows device to `Windows PC`, so later machines do not alert. Mobile session presence never performs detection or dispatch at all. Web and MFA routes discard the async notification promise at the response boundary, while the sender applies one shared ten-email hourly cap across security and unrelated mail. Legitimate new sign-ins and MFA changes can therefore produce no out-of-band warning through four independent paths.
**Suggested fix:** Key a sign-in on the authenticated Supabase session ID before upsert, add mobile parity, enqueue alerts durably (or use a response-lifetime primitive), and reserve a security-alert budget with event-specific deduplication. Add same-label/different-session, mobile, response-completion, and mixed-volume throttle tests.
**Resolution:** Fixed on `dev` in `6b14e5ef`. A sign-in is new when its authenticated Supabase session has not been seen, on web (`track-session`) and mobile (`session-presence`) alike. Mobile two-factor changes now alert as web's do. Every alert is scheduled with `after()` so it outlives the response. Security email has its own hourly budget (20, separate from the 10 for other mail). Each sign-in alert is deduplicated by session. Tests fail on the old sender and routes. This is a response-lifetime primitive, not a durable outbox. F-22 (organization context in these emails) remains open. **Reopened:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses). The repair broke detection outright. `custom_access_token_hook` (037) inserts the `user_sessions` row for a session when its first token is minted, before `track-session` or `session-presence` runs, so `isNewSignInSession` always finds a row and no new sign-in alert is ever sent, on web or mobile. This was proven on the local database: calling the hook with a fresh session id takes the row count from 0 to 1. The unit tests mocked the lookup, so they could not see it. Suggested fix: claim novelty in the app's own write, for example an update that sets `platform` and `device_label` only `WHERE platform IS NULL` and alerts when it returns a row, plus a live-database test of hook-then-track. The `after()` scheduling, the security budget and the dedupe are sound and can stay. **Repaired again:** fixed on `dev` in `4aee91cd`. `claimNewSignIn` claims the app's first report of a session. It fills the `platform` the hook leaves empty through an update that wins exactly once, and also requires a sign-in in the token's `amr` within 15 minutes, so a session whose row was deleted and recreated by a refresh does not read as new. `new-sign-in-claim.integration.test.ts` runs the real hook, then the claim, on the local database. It proves the claim wins once and a refresh does not reset it. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): re-read `claimNewSignIn` and both callers. The claim runs before the upsert, fills the hook's empty `platform` once, and requires a sign-in within 15 minutes, so a refresh after a role change stays quiet. A two-factor sign-in reaches it only after the code, since the app refuses the aal1 session. The live-database test runs the real hook. No new defect.

### 41a2/F-20 [P1] closed - Web logout can hang before revoking the session

**File:** `apps/web/src/app/(app)/goodbye/RunLogoutTeardown.tsx:77`
**Found:** 2026-09-24 by `/audit` (scope: sign-out and sessions; lens: security and reliability)
**Why it matters:** Logout awaits authenticated cleanup before it calls the server-backed sign-out, but `clearLogoutCleanup` uses an unbounded fetch (`apps/web/src/features/account/client/api.ts:175`). A half-open cleanup request leaves the CTA disabled and the access token unrevoked; on inactivity the page can already claim the user was signed out while teardown is still pending.
**Suggested fix:** Give cleanup a short hard deadline and move revocation/sign-out into a guaranteed continuation/finally path. Add a never-settling cleanup test proving local and server revocation still run.
**Resolution:** Fixed on `dev` in `97d455fd`. Pre-sign-out cleanup and realtime teardown are bounded at 3 seconds, and the server-backed sign-out always runs afterwards. Tests cover a never-settling cleanup. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): cleanup is bounded at 3 seconds, and `signOutFromBrowser` always runs afterwards. No new defect.

### 41a2/F-21 [P1] closed - Manager-driven login-email changes leave the target's sessions and notices unmanaged

**File:** `apps/web/src/app/api/employees/manage/route.ts:719`
**Found:** 2026-09-24 by `/audit` (scope: account email changes; lens: security)
**Why it matters:** After step-up for the acting manager, the route changes a linked user's Auth email through `auth.admin.updateUserById` but does not revoke that target's existing DubGrid sessions or send application-controlled notices to the old and new addresses. A displaced or compromised session therefore retains access after an administrator changes its login identity, and the affected person receives no guaranteed organization-specific explanation from the app. Provider-native behavior was not treated as a substitute because it was not verified in this audit.
**Suggested fix:** Revoke all target sessions after the identity change, send durable notices to both addresses naming the organization and actor/action context, and define compensation for any partial failure. Add target-session and both-recipient notification tests.
**Resolution:** Fixed on `dev` in `6af4dc71`. After a committed change, the web and mobile staff routes revoke the person's sessions (only the other sessions when someone edits their own record) and email both addresses. The previous address learns the new one and the organization. The admin-typed new address learns only the organization, per the misaddressed-email rule. The change has already committed, so each step fails independently and is reported to Sentry and the log rather than failing the save. Notices are sent directly, not through a durable outbox. Boundary tests require the follow-up after both sync calls. **Reopened:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses). The revocation does not end the target's sessions. `revokeAllUserSessions` sets a watermark that rejects only tokens issued before it, and deletes `user_sessions` rows, but the target's refresh token still works. The token hook re-inserts the row and mints a token issued after the watermark, so access resumes on the next refresh, within the hour. Per-session markers expire after `TTL.ACCESS_TOKEN` (1 hour), so they would not hold either. The notices are sound. Suggested fix: end the target's provider sessions too, for example a service-role-only function deleting the user's `auth.sessions`, or the `jwt_refresh_locks` mechanism `force_logout_user` uses, with a live-database test that a refresh after the change is refused. Correct the `revokeAllUserSessions` docstring, which now lists this case. **Repaired again:** fixed on `dev` in `bdeffc70`. Migration 046 adds `end_user_auth_sessions`, a service-role-only function that deletes the user's provider sessions (refresh tokens cascade) and optionally spares one. `endUserSessions` pairs it with the watermark or per-session markers, and the email-change follow-up uses it. The `revokeAllUserSessions` docstring now says it does not end sessions. `end-user-auth-sessions.integration.test.ts` proves on the local database that the sessions and refresh tokens go, the kept session and other users' stay, and a signed-in user cannot call it. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): re-read `endUserSessions`, the follow-up and migration 046. Markers or the watermark come first, then the provider sessions are deleted, sparing the actor's own. The function is SECURITY DEFINER with a pinned search path and is executable only by the service role, and a failure is reported without failing the committed change. Locally, `postgres` is not a superuser and holds DELETE on `auth.sessions` by grant from `supabase_auth_admin`. The production grant is not yet confirmed, recorded as F-32.

### 41a2/F-22 [P2] closed - Auth and security emails lose organization context and use ambiguous account wording

**File:** `apps/web/src/features/notifications/server/sender.ts:209`; `apps/web/src/emails/auth/PasswordChangedEmail.tsx:9`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: quality and security)
**Why it matters:** `sendNotification` receives `orgId` but renders only a generic title/message, so "New sign-in on your account" omits the organization even though the route also captured browser, location, and time-capable metadata. Organization-scoped notification mail has the same central loss. Conversely, password/email/MFA/recovery templates describe the account generically and direct users to "your administrator" even though credentials are account-global and an org admin may not control them. Recovery omits the configured one-hour code expiry, and the reauthentication template says an unsolicited sensitive-action code can simply be ignored. The custom invitation email is the positive exception: it correctly names the organization and says 72 hours.
**Suggested fix:** Make optional organization context first-class in notification subjects/templates and include device, browser, location, and explicit event time for sign-ins. Phrase credential mail as "your DubGrid sign-in account"; when a verified initiating organization is available, name it as context (for example, "while signed in to {organization}"), but never imply it owns the credential or disclose organization counts/memberships. Route suspicious activity to session review/password reset/support, state code expiry, and keep the unused generic Supabase invite template disabled unless it can receive a verified org name.
**Resolution:** Fixed on `dev` in `a30e3270` and `39a387fd`. The Supabase credential emails now describe "your DubGrid sign-in" and no longer send anyone to "your administrator". A change you didn't make routes to a password reset, session review and support@dubgrid.com. Recovery states its 1-hour expiry. An unrequested identity code now warns that someone may know your password. Supabase sends these templates and cannot be given a verified organization, so they name none. App notification emails carry the organization in the subject and above the heading. Security alerts name it only as "While signed in to {organization}" and keep it out of the subject. The new sign-in alert states device, browser, approximate location and an explicit UTC time. The drift check (F-26) pins the wording rules and checks the expiry against `config.toml`. It also asserts nothing sends Supabase's generic invite, which cannot name an organization, so that template stays unused. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): credential templates name the DubGrid sign-in and route suspicious activity to reset, sessions and support. Notification mail carries the organization, and the drift check pins the wording. No new defect.

### 41a2/F-23 [P2] closed - Login audit records can claim success before MFA and name the wrong organization

**File:** `apps/web/src/app/api/auth/login/route.ts:415`
**Found:** 2026-09-24 by `/audit` (scope: sign-in; lens: security observability)
**Why it matters:** An MFA-required password login skips post-sign-in orchestration but is still written as `outcome: "succeeded"` before the TOTP challenge completes. When orchestration switches organizations, the audit entry uses the original token's `claims.org_id` rather than the computed effective claims. Abandoned MFA challenges look like successful sign-ins and multi-org events can be attributed to the wrong tenant.
**Suggested fix:** Record a challenged/pending outcome after password verification, write success only after MFA completion, and pass the effective post-switch org ID into the audit event. Add abandoned-MFA and cross-org attribution tests.
**Resolution:** Fixed on `dev` in `d5b28904`. On web and mobile, the password step of a two-factor sign-in is recorded as `challenged` (`second_factor_required`). `POST /api/auth/login/complete` and `/api/mobile/v1/auth/sign-in-complete` record `succeeded`, but only for a session carrying a TOTP proof from the last ten minutes, against the organization the session ended in. The login pages call them once sign-in finishes. Web records a switched sign-in against the effective organization. Route, page and helper tests cover abandoned challenges, completion and cross-org attribution. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the password step records `challenged`. Success is recorded only by the completion routes, and only for a fresh TOTP (aal2) session against its effective organization. No new defect.

### 41a2/F-24 [P2] closed - Corrupt persisted mobile auth can trap the user in a retry-only recovery loop

**File:** `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:72`
**Found:** 2026-09-24 by `/audit` (scope: mobile session restoration; lens: resilience)
**Why it matters:** An unreadable access token clears query state and sets `restoreError`, but does not clear Supabase persistence. Other restore errors are only cleared for two exact refresh-token strings. The recovery screen labels the state as connectivity and offers only "Try again", so structurally corrupt storage can replay the same failure indefinitely until the user clears app data or reinstalls.
**Suggested fix:** Clear structurally unreadable auth automatically, broaden safe stale-token classification, or provide "Clear session and sign in again" alongside retry. Add malformed storage and non-matching provider-error tests.
**Resolution:** Fixed on `dev` in `7710b1ec`. An unreadable stored token now clears the stored session and goes to sign-in instead of the retry screen. Any 4xx or known stale-session code from the provider does the same, while transport failures, 5xx, 408 and 429 keep the retry. The recovery screen gains "Sign in again", which always ends signed out, even when storage never answers (5-second bound). Provider tests cover malformed storage, stale-session codes, network failure and a hung sign-out. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): an unreadable token and 4xx/stale-code restore errors clear the stored session, and transport errors keep the retry. "Sign in again" is bounded. No new defect.

### 41a2/F-25 [P2] closed - Impersonation notices trust recipient and organization wording supplied by the browser

**File:** `apps/web/src/app/api/notify-impersonation/route.ts:17`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: security)
**Why it matters:** The authenticated Gridmaster route accepts `targetEmail` and `targetOrgName` from the request and uses them directly in the recipient, subject, and body; the impersonation `sessionId` is consulted only after delivery for a best-effort IP update. A caller can therefore send a trusted DubGrid "account access" security notice to an arbitrary address with arbitrary organization wording, independent of the named session.
**Suggested fix:** Resolve recipient, organization, actor, justification, and session state from the authenticated Gridmaster-owned impersonation record before rendering or sending, and reject mismatched/closed sessions. Add tampered recipient/org tests.
**Resolution:** Fixed on `dev` in `5d88533d`. The browser sends only the event and session id. The route loads the session only for this Gridmaster on this device, requires it live for a start notice and ended for an end notice, and reads the recipient from the target account and the organization and reason from the database. Route tests cover a spoofed recipient, a foreign session and mismatched session states. The same email review removed the inviter's identity from invitation emails (`5aeb7911`). **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the notice is resolved entirely from this Gridmaster's own session on this device (`notify-impersonation/route.ts`). No new defect.

### 41a2/F-26 [P3] closed - Auth-email source and deployable HTML can drift without CI noticing

**File:** `apps/web/scripts/generate-auth-email-templates.test.mts:1`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: tests)
**Why it matters:** The React email generator writes `supabase/templates` in place and is outside the normal web test target; CI runs the `src` suite, while production sync reads the committed HTML. A wording, expiry, or security-link correction can therefore pass CI but leave the template that is actually pushed to Supabase unchanged.
**Suggested fix:** Add a non-mutating render-and-compare drift test to the normal verification path, covering all template bodies, subjects, and required Supabase placeholders. Keep the existing write mode as an explicit regeneration command.
**Resolution:** Fixed on `dev` in `6a527925`. The template list lives in `src/emails/auth/supabase-templates.ts`, shared by `npm run email:build` and a new check in the normal suite. The check renders and formats each template as the generator does, without writing, and compares it with the committed HTML. It was proven to fail on a one-word source change. It also asserts every placeholder, the `config.toml` subject and path for each template, and that the push script syncs exactly the rendered set. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): the drift check renders and formats every template like the generator and compares it with the committed HTML. It was proven to fail on a one-word change. No new defect.

### 41a2/F-27 [P3] closed - Several auth and invitation rate limits return an epoch as Retry-After

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:98`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: protocol correctness)
**Why it matters:** `checkRateLimit` returns `reset` as an epoch timestamp in milliseconds, but invitation create/edit/revoke/resend and account deletion divide it directly by 1,000 instead of subtracting `Date.now()`. A 429 can advertise a wait of roughly the current Unix timestamp in seconds—decades—rather than the remaining interval, misleading clients and retry infrastructure.
**Suggested fix:** Centralize `Retry-After` formatting as `max(1, ceil((reset - Date.now()) / 1000))` and replace every affected caller, with a unit test pinned to a known clock.
**Resolution:** Fixed in 41a2 on `claude/lucid-hopper-exfpqt` (`0846df8b`). One `retryAfterSeconds` helper computes `max(1, ceil((reset - now) / 1000))` for all 33 throttled routes. It is unit-tested on a pinned clock, and the route throttle tests now bound the header by the window. **Closed:** Audit 2026-09-25 (scope: current, 4bb992c0..9e4b15cd; all lenses): every 429 in scope uses `retryAfterSeconds` or an equivalent `reset - now`. No epoch arithmetic remains. No new defect.

### 41a2/F-28 [P2] closed - Rotating an invitation's access tells super admins it was revoked

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:742`
**Found:** 2026-09-25 by `/audit` (scope: current; lens: quality)
**Why it matters:** Since 44 the replace-access path rotates the token on the same row and revokes nothing. It still dispatches `invitation_revoked`, which tells every super admin and the original inviter that "{actor} canceled the invitation to {email}", followed by `invitation_created` for the same id. The settled contract is one `invitation.access_replaced` event against a stable id. Administrators are told an invitation was canceled when it is live with new access.
**Suggested fix:** Dispatch one event that says what happened, for example reuse `invitation_resent` or add an `invitation_access_changed` type, and update the route test that asserts the pair.
**Resolution:** Fixed on `dev` in `c54ccff6`. The access change dispatches one `invitation_resent` for the same invitation instead of `invitation_revoked` plus `invitation_created`. The route test asserts the single event. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): the access change now dispatches one `invitation_resent`. The real revoke path still sends `invitation_revoked`, which is correct. No new defect.

### 41a2/F-29 [P3] closed - Resend and access change report the email kill switch as a send failure

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:715`
**Found:** 2026-09-25 by `/audit` (scope: current; lens: quality)
**Why it matters:** Both failure paths detect "email not configured" with `message === "Email service not configured"`. `sendResendEmail`'s platform kill switch throws "Email service not configured: sending is disabled...", so it falls through to 502 "We couldn't send... Try again" instead of the 503 the create route returns through `isEmailNotConfigured`. A retry cannot succeed while the switch is off.
**Suggested fix:** Use `isEmailNotConfigured` in both paths, as create and Gridmaster setup already do.
**Resolution:** Fixed on `dev` in `1975194a`. Both failure paths use `isEmailNotConfigured` and answer 503 for the kill switch. The new route test fails on the old exact match. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): both failure paths use `isEmailNotConfigured`, and the test throws the real kill-switch message. No new defect.

### 41a2/F-30 [P2] closed - Re-inviting an address with a pending invitation silently keeps its old role

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:91`
**Found:** 2026-09-25 by `/audit` (scope: current; lens: quality)
**Why it matters:** When `send_invitation` reports an active invitation, `refreshPendingInvitation` matches on email and employee only, rotates that row and emails it. It ignores the requested role, departments and management departments. Inviting someone as a User when a Super Admin invitation is pending for them re-sends the Super Admin link and returns success, and the audit entry records the requested role, not the one sent. This predates the range, but the route now sends the email itself, so the mismatch reaches the invitee directly.
**Suggested fix:** Refresh only when the pending row's role and departments match the request. Otherwise return the 409 "already pending" guidance, or route through `replace_access`, which applies the tier check. Record the role actually sent.
**Resolution:** Fixed on `dev` in `a53edf53`. The duplicate refresh happens only when the pending invitation's role, departments and management departments match the request. Otherwise create answers 409 and changes nothing. The route test covers a pending Super Admin invitation met by an Admin request. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): the refresh compares role and both department sets, ignoring order and duplicates, and a mismatch answers 409 with no write or email. No new defect.

### 41a2/F-31 [P3] closed - A started self-deletion record never expires

**File:** `apps/web/src/features/account/server/self-deletion.ts:16`
**Found:** 2026-09-25 by `/audit` (scope: current; lens: security)
**Why it matters:** The F-16 repair lets a user with an `account.deletion_started` or `gdpr.erasure_started` record skip the permission check indefinitely. After a partial failure, a user who later joins an organization that requires admin-approved deletion can still delete their own account directly, months later. The exposure is the user's own account and every other guard still applies, but the permission gate is meant to hold.
**Suggested fix:** Bound the resume window (for example the record must be under 7 days old), or require that the user now holds no active membership, which is the state a partial failure leaves.
**Resolution:** Fixed on `dev` in `5d74a0a0`. Only a started record from the last seven days (`SELF_DELETION_RESUME_WINDOW_MS`) allows resuming without the permission check. The helper test pins the window. **Closed:** Audit 2026-09-25, second pass (scope: current, 9e4b15cd..36d81952 plus the files of findings still `fixed`; all lenses): `hasStartedSelfDeletion` filters to records under seven days old, pinned by the helper test. No new defect.

### 41a2/F-32 [P1] invalid - Production may not let migration 046 delete provider sessions

**File:** `supabase/migrations/046_end_user_auth_sessions.sql:28`
**Found:** 2026-09-25 by `/audit` (scope: current; lens: security)
**Why it matters:** `end_user_auth_sessions` deletes from `auth.sessions` as its owner, `postgres`. Locally `postgres` is not a superuser but holds DELETE on `auth.sessions` by grant from `supabase_auth_admin`, which is Supabase's standard setup, and the live-database test passes. Hosted Supabase has been narrowing what `postgres` may do in the `auth` schema, and the linked project was not inspected. If the grant is missing there, `endUserSessions` throws after the watermark, the failure is reported, and an administrator's email change again leaves the person's sessions refreshable.
**Suggested fix:** Before releasing 046, check `has_table_privilege('postgres', 'auth.sessions', 'DELETE')` on the linked project (read-only) or rehearse the migration on a scratch project. If it is refused, fall back to the Auth admin API: sign out with each tracked session's JWT, or use the `jwt_refresh_locks` refusal.
**Resolution:** Invalid, 2026-09-25: checked on the production project (`xpoylacxkbphnudsupuu`) in a read-only transaction that was rolled back. Connected as `postgres`: `has_table_privilege('postgres', 'auth.sessions', 'DELETE')` returned `t`, granted by `supabase_auth_admin`, the same as the local stack. `postgres` is not a superuser there. Migration 046 will be able to end provider sessions in production. The same check found production's migration ledger at `042`, not `040`, so only `043` to `046` remain to apply.
