# Feature: Session revocation that holds

**From build-plan:** feature 41b1
**Status:** verified

## Goal

When DubGrid says a session is over, it should stay over. Today revoking one
device writes a one-hour marker and deletes DubGrid's session row, but the
provider session and its refresh token survive, so the device is back within
the hour. A Gridmaster force-logout locks refresh for five minutes and leaves
the provider sessions alone. A deleted account's access tokens keep working on
web for up to an hour, because web verifies tokens locally. End the provider
session wherever the intent is to end a session, as 046 already does for a
manager's email change (F-21).

## In scope

- **Revoking one device ends it.** A new service-role function ends exactly
  one provider session of one user; its refresh tokens cascade. The web and
  mobile single-device revoke use it, beside the existing marker.
- **Force-logout ends every session.** The Gridmaster force-logout ends the
  target's provider sessions as well as applying its lock and watermark.
- **A deleted account's tokens stop working.** Self-delete, GDPR erase and an
  administrator-approved deletion reject the account's issued tokens once the
  deletion completes.
- **Mobile single-device revoke matches web's error handling**, and both
  record a `security.auth.session` / `session_revoked` audit event with scope
  `device`.

## Out of scope

- **The single-revoke alert.** Web dispatches one, but `events.ts` drops
  `initiatedBy: "self"`, so there is no alert to match on mobile. Alert
  coverage is 41c.
- **Credential change completion** (41b2) and **assurance coverage** (41b3).
- **Applying migration 047 to production.** Item 41 authorizes no production
  migration; it rides the next reviewed release.

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - end one provider session** - migration 047
      `end_user_auth_session(p_user_id, p_session_id)`, service role only,
      deleting that user's one `auth.sessions` row; lock its checksum. Add
      `endUserSession(userId, sessionId)` beside `endUserSessions`: the
      per-session marker, then the function. _Done when:_
      `npm run db:migrations:check` passes, and a live-database test proves
      the named session and its refresh tokens go, the user's other sessions
      and another user's session with the same id guard stay, and a signed-in
      user cannot call it.
- [x] **Step 2 - single-device revoke ends the session, on both platforms** -
      `revokeUserSessionForUser` ends the provider session through
      `endUserSession`. The mobile DELETE handler gains web's error handling,
      and both record the audit event. _Done when:_ route tests on both
      platforms prove the session is ended, a failure answers an error rather
      than success, and the audit event is written.
- [x] **Step 3 - force-logout ends every session** - the Gridmaster
      force-logout calls `endUserSessions` for the target. _Done when:_ the
      route test proves the provider sessions are ended and a failure is
      reported, not swallowed.
- [x] **Step 4 - a deleted account's tokens stop working** - the three
      deletion paths apply the watermark once the account is gone, reporting
      a failure without failing the completed deletion. _Done when:_ route and
      helper tests prove the watermark is written after a successful deletion
      and not when the deletion fails.

- [x] **Repair F-01 to F-07 - audit findings on the 41b1 diff** - end the
      provider session before the marker; a `device` headline; the caller's
      organization on both platforms; record a revoke only when a session was
      found; spare a Gridmaster's own session and disable their own Force
      Logout; correct the deletion helper's docblock and test; test and comment
      gaps. _Done when:_ each fix has a test or a checked edit, the affected
      suites pass, and a re-audit closes the findings.

## Files / areas

- `supabase/migrations/047_end_user_auth_session.sql`, `checksums.sha256`.
- `apps/web/src/lib/auth/revocation.ts`,
  `apps/web/src/features/account/server/sessions.ts`.
- `apps/web/src/app/api/account/sessions/route.ts`,
  `apps/web/src/features/mobile/server/routes/profile-sessions.ts`.
- `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts`.
- `apps/web/src/app/api/auth/delete-account/route.ts`,
  `apps/web/src/app/api/auth/gdpr-erase/route.ts`,
  `apps/web/src/features/account/server/account-deletion.ts`.
- `apps/web/src/lib/auth/security-audit.ts` (the `device` scope).

## Data / contracts

- **`public.end_user_auth_session(p_user_id UUID, p_session_id UUID) RETURNS
INTEGER`**, SECURITY DEFINER, `search_path = 'public'`, executable by
  `service_role` only. Deletes `auth.sessions` where both match; refresh
  tokens cascade. Returns the rows ended (0 or 1).
- The production grant it relies on (`postgres` DELETE on `auth.sessions`)
  was confirmed for 046 (41a2/F-32).
- `SecurityEventMetadata.scope` gains `"device"`.

## Testing

- Live-database test for 047 (skips when the local stack is down, like the
  other `*.integration.test.ts`).
- Route tests for both revoke routes, force-logout, and the deletion paths.

## Notes for the AI

- Mirror 046 exactly: pinned search path, REVOKE from PUBLIC, anon and
  authenticated, GRANT to service_role; never edit 046.
- The marker still matters: access tokens already issued stay valid until
  expiry, which only the marker (or watermark) rejects.
- Deleting the auth user already deletes its provider sessions; the gap is
  the issued access tokens on web, which only the watermark closes.
- No em dashes.

## Findings

### 41b1/F-01 [P2] closed - A failed provider delete hides the device and makes a retry a silent no-op

**File:** `apps/web/src/lib/auth/revocation.ts:197`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** `endUserSession` writes the marker and deletes the `user_sessions` row before calling `end_user_auth_session`. If the RPC fails the route answers 500, but the row is gone, so the device drops out of the list and a retry by `refreshTokenHash` finds nothing and succeeds without ending the provider session, which is the gap 41b1 closes.
**Suggested fix:** Call the idempotent RPC first, then the marker, and pin the order in a test.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. `endUserSession` calls the idempotent `end_user_auth_session` before the marker, so a failed provider call leaves the row for a retry. Tests pin the order and that the row survives a provider failure. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-02 [P3] closed - The audit registry has no headline for a single-device sign-out

**File:** `apps/web/src/lib/audit/registry.ts:1156`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** The new `device` scope falls through to "Signed out", which reads as the actor signing themselves out.
**Suggested fix:** Add a `device` headline.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. The registry names the `device` scope "Signed out one of their devices", tested through `describeAuditAction`. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-03 [P3] closed - Web and mobile record different organizations for the same revoke event

**File:** `apps/web/src/app/api/account/sessions/route.ts:79`; `apps/web/src/features/mobile/server/routes/profile-sessions.ts:91`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** Web records the revoked device's stored org (or null), mobile the caller's current org, and the existing sign-out path the caller's token org, so the same event lands in different organizations' logs.
**Suggested fix:** Record the caller's organization on both platforms.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. Web now records the caller's token `org_id`, like mobile and the bulk sign-out. The route test asserts it. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-04 [P3] closed - A revoke that matched nothing is still recorded as a success

**File:** `apps/web/src/features/account/server/sessions.ts:175`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** `revokeUserSessionForUser` resolves void when the hash matches no row, and both routes then record `session_revoked` `succeeded`.
**Suggested fix:** Return whether a session was found and record only then.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. `revokeUserSessionForUser` returns whether a session matched, and both routes record the revoke only then. Helper and route tests cover an unmatched hash. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-05 [P3] closed - Force Logout on a Gridmaster's own row now ends their own session for good

**File:** `apps/web/src/components/gridmaster/GridmasterAccountsView.tsx:433`; `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:57`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** The button is enabled on the caller's own row, unlike the other actions, and `endUserSessions` without `keepSessionId` now deletes the caller's current provider session rather than a five-minute lock.
**Suggested fix:** Disable the button for self and spare the caller's session in the route when the target is the caller.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. The Force Logout button is disabled on the caller's own row, and the route spares the caller's current session when a Gridmaster targets themselves. The route test covers self. **Still fixed, not closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24): the disabled button holds, but the route's keep-own-session branch left the Gridmaster's other tokens valid (F-08). **Repaired again:** the route refuses a self force-logout with a 400 before any change, matching the disabled button. **Closed:** Audit 2026-09-25, second pass (scope: current, bc090b24..2d3fe77f): the route refuses self after authentication, step-up and parameter checks and before any change; the only other caller cannot reach a Gridmaster; the button stays disabled. No new defect beyond F-10.

### 41b1/F-06 [P3] closed - The deletion token helper describes a failure its test models wrongly

**File:** `apps/web/src/features/account/server/account-deletion.ts:23`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** `cacheSet` swallows Redis failures, so only the `user_sessions` delete can reject; the docblock's reasoning and the test's "cache down" error describe a failure that cannot occur.
**Suggested fix:** Correct the docblock and model the real failure in the test.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. The docblock states the real reasons (runs only after a successful deletion; only the row delete can reject) and the test models a database failure. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-07 [P3] closed - Test and comment gaps in the 41b1 diff

**File:** `apps/web/src/features/account/server/sessions.test.ts`; `apps/web/src/lib/auth/revocation.test.ts`; `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:54`; `blueprint/build-plan.md`
**Found:** 2026-09-25 by `/audit` (scope: current, 6d33a1ad..10b9aae1; all lenses)
**Why it matters:** An unused `deleteEq` mock; the row delete's scoping and the RPC-then-marker order are not asserted; the force-logout comment says the refresh mints a new session (it mints a new token on the same session); the 41b1 plan line still promises mobile alert parity, which the spec moved to 41c.
**Suggested fix:** Remove the dead mock, assert scoping and order, correct the comment and the plan line.
**Resolution:** Fixed on `dev` in the 41b1 repair checkpoint. The unused mock is gone, the helper test asserts the delete's `user_id` and hash scoping, the order is pinned in the revocation test, the force-logout comment and the 41b1 plan line are corrected. **Closed:** Audit 2026-09-25 (scope: current, 10b9aae1..bc090b24 plus a fresh read of 6d33a1ad..bc090b24; all lenses): the defect is gone and the repair introduced none.

### 41b1/F-08 [P2] closed - A Gridmaster's self force-logout left their other devices' tokens valid

**File:** `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:59`
**Found:** 2026-09-25 by `/audit` (scope: current, 10b9aae1..bc090b24; all lenses)
**Why it matters:** The F-05 repair spared the caller's session through `endUserSessions(self, { keepSessionId })`, but `force_logout_user` had already deleted every `user_sessions` row, so `revokeOtherUserSessions` listed nothing, wrote no markers and skipped the watermark. The other devices' issued access tokens stayed valid on web for up to an hour, and the kept session could still be lost to the five-minute refresh lock.
**Suggested fix:** Refuse a self force-logout server-side, matching the disabled button.
**Resolution:** Fixed on `dev` in the 41b1 second repair checkpoint. The route answers 400 before the SQL function, the provider call or the audit when the target is the caller, pointing to "Sign out other devices". The keep-session branch is gone. The route test covers self. **Closed:** Audit 2026-09-25, second pass (scope: current, bc090b24..2d3fe77f): the route refuses self after authentication, step-up and parameter checks and before any change; the only other caller cannot reach a Gridmaster; the button stays disabled. No new defect beyond F-10.

### 41b1/F-09 [P3] closed - Two stacked docblocks on revokeUserSessionForUser, the older one inaccurate

**File:** `apps/web/src/features/account/server/sessions.ts:166`
**Found:** 2026-09-25 by `/audit` (scope: current, 10b9aae1..bc090b24; all lenses)
**Why it matters:** The new one-line docblock sat under the old one, which still said the marker is written first and even when no row matches.
**Suggested fix:** Merge them into one accurate docblock.
**Resolution:** Fixed on `dev` in the 41b1 second repair checkpoint. One docblock: the provider session, issued tokens and row end; false when nothing matched. **Closed:** Audit 2026-09-25, second pass (scope: current, bc090b24..2d3fe77f): the route refuses self after authentication, step-up and parameter checks and before any change; the only other caller cannot reach a Gridmaster; the button stays disabled. No new defect beyond F-10.

### 41b1/F-10 [P3] closed - The self force-logout check compares ids case-sensitively

**File:** `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:48`
**Found:** 2026-09-25 by `/audit` (scope: current, bc090b24..2d3fe77f; all lenses)
**Why it matters:** `z.string().uuid()` accepts uppercase and Postgres compares UUIDs case-insensitively, so a Gridmaster sending their own id in uppercase passed the self check. The result is a complete self sign-out with no token gap, so it is harmless, but the check says it refuses self.
**Suggested fix:** Compare lowercased ids.
**Resolution:** Fixed on `dev` in the 41b1 third repair checkpoint: both ids are lowercased before comparing, and the route test sends an uppercased self id. **Closed:** Audit 2026-09-25, third pass (scope: current, 2d3fe77f..65460f38): both ids are lowercased and the uppercased self id is refused before any change. No new defect.
