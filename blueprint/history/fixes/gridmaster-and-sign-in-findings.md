# Fix: Gridmaster and sign-in findings batch (F-80, F-81, F-33, F-28)

**Type:** Fix
**Status:** verified

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

## Completion

- F-81 and F-80 landed first in 43c, which made the same changes; this batch
  kept 43c's versions and added nothing further for them.
- F-33 shipped as migration 060 (43c took 059), with the impersonation route
  refusing a navigation end so the escape is recorded once. Production needs
  060 applied by the runbook after the next release.
- F-28 records a verified refusal once per session, classified in the
  service-role inventory.
- Evidence: the touched suites, the live test for 060 (which fails against
  058), the full pre-push suites, and CI on 81b44389 (type check, unit,
  integration, mobile verify, lint and build all passing).
- Also archived here: F-54, F-76, F-77 and F-79, which closed in this
  session's follow-ups after the security findings cleanup was archived.

## Findings

### gridmaster-and-sign-in-findings/F-28 [P3] closed - A host-organization denial after the second factor is not recorded

**File:** `apps/web/src/app/(app)/login/OrgLogin.tsx:236`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** On the web two-factor path the client finds no membership, signs out locally and shows a toast; the log ends at the challenge. Predates 41c2.
**Suggested fix:** A server-side refusal record for this case, for example a denial reason on the local sign-out.
**Resolution:** Fixed: the web two-factor path's local sign-out carries the refusal (`organization_access_denied` and the organization's slug); the sign-out route verifies the token and records a `rejected` sign-in with that reason, no organization, `surface: web`, `method: totp` and the session hash only when the organization exists, the caller has no active membership in it and the session has no such row yet, before revoking. A failed check records nothing and never blocks the sign-out; mobile is unchanged. Tests cover the parsing, a verified refusal, a member, a missing organization, a repeat, a failed check, an unverifiable token and the client's request body. Re-review (fix batch, 2026-09-26): closed; the actor comes from the verified token, the organization slug is only a claim checked against the organization and the caller's own membership, the row is written once per session with no organization, and the extra reads run only when a refusal is claimed. The helper is classified in the service-role inventory.

### gridmaster-and-sign-in-findings/F-33 [P3] closed - The proxy's escape end of an impersonation is not audited

**File:** `apps/web/src/proxy.ts:478`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Visiting `/gridmaster` while impersonating ends the row with reason `navigation` and records nothing. Kept out of 41c2 so the middleware gains no service-role write.
**Suggested fix:** Record it from a route or a job (the 41c3 notice work may carry it).
**Resolution:** Fixed: migration 060 redefines `end_impersonation` (from 058) to write an `impersonation.ended` audit row, as the Gridmaster with their email, in the target organization and naming the reason `navigation` and the trigger `escape`, whenever a `navigation` end actually ends a row; every other reason is still recorded by its route, and the middleware gains no service-role writer. A live test finds exactly one row for an escape, none for a manual end or a second escape of an ended row, keeps 058's expired end time, and fails against 058. Production needs 060 applied by the runbook; no release depends on it. Renumbered to migration 060 (43c took 059). Re-review (fix batch, 2026-09-26): closed; 060's body differs from 058 only in the escape's audit insert, which runs as the function's owner under 056, and no other path writes a row for a navigation end: the impersonation route now refuses that reason.

### gridmaster-and-sign-in-findings/F-80 [P3] closed - A Gridmaster's deactivate and reactivate ask for no fresh proof

**File:** `apps/web/src/app/api/gridmaster/users/route.ts` (PATCH)
**Found:** 2026-09-26 while building 43b
**Why it matters:** Every other account action on the Gridmaster person page (terminate, reinstate, force logout, password reset, name and sign-in email changes) requires fresh proof; deactivating revokes every session and blocks sign-in on the Gridmaster session alone, and the route does not refuse a Gridmaster target.
**Suggested fix:** Require `requireSensitiveActionAuth` on the PATCH, run the person page's Deactivate through step-up, refuse a Gridmaster target, and classify the route in the sensitive-action inventory.
**Resolution:** Fixed in 43c: the PATCH requires `requireSensitiveActionAuth` and refuses a Gridmaster target through `loadPersonTarget`; the person page runs Deactivate and Reactivate through step-up; the inventory classifies the route `sensitive`. Route and view tests cover a stale session, a Gridmaster target and the step-up. Re-review (fix batch, 2026-09-26): closed; the route checks CSRF, the Gridmaster session, fresh proof, then the target before any write, and the person page runs it through step-up (43c's implementation, which this batch's own matched).

### gridmaster-and-sign-in-findings/F-81 [P3] closed - The person page refreshes on membership changes only

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts`
**Found:** 2026-09-26 by review of 43b
**Why it matters:** A change to the person's staff record or invitations made elsewhere shows on the Gridmaster person page only after its 30-second stale time or a reload; the page's own actions refresh it.
**Suggested fix:** Invalidate the `["gm", "person"]` prefix on `employees` and `invitations` events too.
**Resolution:** Fixed in 43c: `employees`, `invitations`, `user_sessions` and `profiles` events invalidate the `["gm", "person"]` prefix, so every open person page refreshes; memberships keep their exact key. Push devices, calendar feeds and known devices are not in the realtime publication, so the page refreshes itself after its own actions on them. Re-review (fix batch, 2026-09-26): closed; staff, invitation, session and profile events refresh every open person page (43c's implementation). Refetch coalescing is F-83.

### gridmaster-and-sign-in-findings/F-54 [P3] closed - The web test cache hashed the Supabase CLI's gitignored state

**File:** `turbo.json` (`@dubgrid/web#test`)
**Found:** 2026-09-25 by `/audit` re-review of cd8758d8
**Why it matters:** Turbo's explicit input globs ignore `.gitignore`, so `supabase/.temp/**` (rewritten by the CLI on update checks, `link` and `start`) caused cache misses with no source change, and local hashes differed from CI's. Never a wrongly replayed pass.
**Suggested fix:** Exclude `supabase/.temp` and `supabase/.branches`.
**Resolution:** Both are negated in the inputs; a dry run shows no `.temp` file. Re-review (origin/dev 54a9f5f5): closed; the negations sit in `@dubgrid/web#test`, the other tasks use `$TURBO_DEFAULT$`, which respects `.gitignore`, and a dry run hashes 2202 inputs with none under `supabase/.temp` or `supabase/.branches` and no gitignored file at all.

### gridmaster-and-sign-in-findings/F-76 [P3] closed - A Gridmaster's sign-out ends long-expired impersonations as manual, with a late notice

**File:** `apps/web/src/app/api/account/logout-cleanup/route.ts:29`
**Found:** 2026-09-26 by `/audit` re-review of e1c83ac1..e9d49b20
**Why it matters:** Nothing ends a timed-out row, so the next sign-out, possibly days later, ended each one as `manual` with a fresh email and an audit row carrying the wrong reason; and one failed row stopped the loop, leaving the rest open.
**Suggested fix:** End rows past `expires_at` as `expired` without the email, and keep going past a failed row before answering 500.
**Resolution:** Fixed: expired rows end as `expired`, audited as such, with no email (the database still writes its in-app notices); a failed row is logged and the rest still end, then the route answers 500. Route tests cover both and fail against the previous code. Re-review (e6d85e85): kept fixed, since a failed audit write still left the loop; it is now logged, counted as a failure and the loop continues, with a test. Re-review (origin/dev 54a9f5f5): closed; expired rows end as expired with no email, failed ends and audit writes are counted without stopping the loop, the sign-out caller never waits on or retries a 500, and each route test fails against the code before its repair. The end time of an expired row is F-79.

### gridmaster-and-sign-in-findings/F-77 [P3] closed - The password length hint says characters where the rule counts bytes

**File:** `packages/domain/src/password.ts:56`
**Found:** 2026-09-26 by `/audit` re-review of e1c83ac1..e9d49b20
**Why it matters:** A password of 25 emoji (100 bytes) is refused with "At most 72 characters".
**Suggested fix:** Word the hint so accents and emoji make sense of it.
**Resolution:** Fixed: the hint reads "At most 72 characters, fewer with accents or emoji", and the test pins it. Re-review (bbff3583): kept fixed, since the mobile reset screen's hint row could run past the card with the longer label; the hint text now shrinks and wraps, as the profile screen's does. Re-review (origin/dev 54a9f5f5): closed; nothing pins the old label, the hint wraps on web and both mobile screens, and every password-setting path refuses more than 72 bytes.

### gridmaster-and-sign-in-findings/F-79 [P3] closed - An impersonation ended as expired at sign-out records the sign-out as its end time

**File:** `apps/web/src/app/api/account/logout-cleanup/route.ts:39`; `supabase/migrations/057_impersonation_notice_wording.sql` (`end_impersonation`, `ended_at = now()`)
**Found:** 2026-09-26 by `/audit` re-review of F-76 (predates it)
**Why it matters:** A session that timed out days earlier reads in history as lasting until the Gridmaster signed out, while the lazy cleanup in `002_functions_triggers.sql` records `ended_at = expires_at`. History only; no access is granted.
**Suggested fix:** In a forward migration, set `ended_at = LEAST(now(), expires_at)` when `p_reason = 'expired'`.
**Resolution:** Fixed: migration 058 redefines `end_impersonation` (from 057) so an `expired` end records `LEAST(now(), expires_at)` and every other reason still records `now()`; nothing else changes. A live test ends a session that timed out two days earlier as expired and reads its expiry back, and fails against 057; it also covers an expired end before the expiry and a manual end. Applied to production 2026-09-26 by the owner, after release pull request 118 (merge 1031b122) deployed and a scratch rehearsal from 057: 58 ledger entries, none missing, health 200, a final dry run up to date, and `end_impersonation` carries the expired end time with its wording, SECURITY DEFINER and grant unchanged. Re-review (d314d205): closed; 058's body differs from 057 only in the end time, grants and comment are kept, `LEAST` never gives a time later than now (so a live session cannot be backdated), no reader depends on the old end time, and the live test fails against 057.
