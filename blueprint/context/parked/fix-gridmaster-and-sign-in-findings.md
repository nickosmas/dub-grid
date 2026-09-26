# Fix: Gridmaster and sign-in findings batch (F-80, F-81, F-33, F-28)

**Type:** Fix
**Status:** verified (parked beside feature 42a, which holds
`current-feature.md`)

## Goal

Close four P3 findings that need no product decision: one Gridmaster action
without fresh proof, one stale Gridmaster page, and two security events that
leave no audit row.

## In scope

- **F-80:** deactivating or reactivating an account
  (`PATCH /api/gridmaster/users`) requires fresh proof and refuses a
  Gridmaster target, like every other account action on the person page. The
  person page runs Deactivate and Reactivate through step-up with the
  credential preflight, and the sensitive-action inventory classifies the
  route.
- **F-81:** the Gridmaster person page refreshes when that person's staff
  record or invitations change elsewhere, not only their memberships.
  `employees` and `invitations` events invalidate the `["gm", "person"]`
  prefix.
- **F-33:** leaving an impersonation by visiting `/gridmaster` writes an
  `impersonation.ended` audit row, as the portal's end and sign-out do. The
  middleware gains no service-role write: migration 060 redefines
  `end_impersonation` (from 058) to insert that row itself when
  `p_reason = 'navigation'` and a row was ended. Every other end reason
  already has a route-written row, so the function writes none for them.
- **F-28:** a two-factor sign-in refused because the person has no access to
  the organization they signed in on writes a `rejected` sign-in with reason
  `organization_access_denied`, as the password path already does. The
  browser's local sign-out tells the server why, and the server records the
  refusal only after verifying the token and confirming there is no active
  membership in that organization, so the client cannot write a false row.

## Out of scope

- F-75 (fresh proof on the schedule-editing functions) and F-62, which need
  owner decisions.
- F-78 (the orphan session after a slow mobile sign-in), which needs a design.
- Rate limiting on these audit writes: each needs a real refusal or an ended
  row.

## Build steps

- [x] **Step 1 - F-81 person page refresh** (landed in 43c first, which
      made the same change; this batch adds nothing further) -
      `getGridmasterRealtimeInvalidationKeys` adds the person prefix for
      `employees` and `invitations`. _Done when:_ the hook's test shows both
      events invalidate `["gm", "person"]` and a membership event still
      invalidates the person key.
- [x] **Step 2 - F-80 deactivate and reactivate need fresh proof** (landed
      in 43c first, with the same route gate, step-up and tests; this batch adds
      nothing further) - the
      PATCH calls `requireSensitiveActionAuth` after the Gridmaster check and
      refuses a Gridmaster target (403, before any write); the person page's
      Deactivate and Reactivate run through `useStepUpAction` with
      `requireCredentialAssurance`, passing the token; the inventory marks the
      route `sensitive`. _Done when:_ route tests show a stale session changes
      nothing, a Gridmaster target is refused, and a fresh session deactivates
      and audits as before; a view test shows the step-up token reaches the
      call and a cancelled prompt changes nothing.
- [x] **Step 3 - F-33 escape end is audited** (migration 060) - an `impersonation.ended` row whose details name the reason `navigation`, the trigger `escape` and `initiated_by` `gridmaster`, the Gridmaster as
      actor with their email, the session id as resource and the target
      organization. _Done when:_ a live test ends a session with `navigation`
      and finds one audit row, ends another with `manual` and finds none, and
      the function still differs from 058 only in that insert.
- [x] **Step 4 - F-28 refusal after the second factor is recorded** -
      `findAndSwitchToOrg` signs out locally with a refusal naming `organization_access_denied` and the organization's slug; the sign-out route verifies the
      token, confirms no active membership in the organization by slug, then
      writes `security.auth.login` / `rejected` / `organization_access_denied`
      with `orgId: null`, `surface: "web"`, `method: "totp"` and the session
      hash, before revoking. _Done when:_ route tests show a verified refusal
      is recorded once, a member's claimed refusal records nothing, an
      unverifiable token records nothing, and local sign-out still succeeds
      in every case; an `OrgLogin` test shows the refusal is sent.

## Testing

- Unit and route tests beside each change; a live test for migration 060.
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.
- Production needs 060 applied by the runbook after it ships.

## Notes for the AI

- Emails and notices name no actor. No em dashes.
- Build in a throwaway worktree; commit each passing step as a checkpoint.
