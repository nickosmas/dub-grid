# Feature: Atomic rotation and recoverable delivery

**From build-plan:** feature 41a2
**Status:** in progress - the rotation contract is settled and a revocation defect found on the way

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
- [ ] **Step 4 - one guarded confirmation wherever an invitation is re-issued
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

## Files / areas

- `supabase/migrations/044_*.sql` (next free number; 043 is taken) plus
  `supabase/migrations/checksums.sha256`.
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

Manual path: open a pending invitation in People, re-issue its access, and
confirm the old link stops working while the new one arrives.

Commands: `npm run type-check`, `npm run test:web`, `npm run lint`,
`npm run db:migrations:check`, and `npm run test:e2e` for Step 4.

## Raised for 41b, not fixed here

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
