# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-05 [P3] open - The password-change audit label is client-reported, and a failed sign-out leaves no record

**File:** `apps/web/src/lib/auth/session-sign-out.ts:28`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Any assured user can record "Changed their password" on a global sign-out without changing anything, and a password change whose sign-out fails is not recorded at all. No access is gained either way.
**Suggested fix:** Record the change independently of the client, which is the F-08 decision; until then the label is client-reported.
**Resolution:**

### F-08 [P2] open - Credential mutations bypass DubGrid's five-minute assurance for a token holder (research G1)

**File:** `apps/web/src/features/account/client/auth.ts:86`; `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx:248`; `apps/web/src/features/account/server/mfa-lifecycle.ts:114`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Password and sign-in email changes are direct Supabase calls, and the factor endpoints DubGrid proxies stay reachable with the same JWT, so the assurance is a client preflight. A stolen access token can change the password (Supabase still requires aal2 when a factor exists) or, on an account with no factor, enroll an attacker's authenticator and lock the owner out, skipping DubGrid's audit. Moving the calls into DubGrid routes would not close it.
**Suggested fix:** A decision for the owner: database triggers on `auth.users` and `auth.mfa_factors` that audit, revoke or alert on credential changes, and/or a shorter `jwt_expiry`. Out of 41b2's scope by design.
**Resolution:**
