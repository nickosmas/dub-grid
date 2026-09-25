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
**Suggested fix:** A decision for the owner: database triggers on `auth.users` and `auth.mfa_factors` that audit, revoke or alert on credential changes, and/or a shorter `jwt_expiry`. Out of 41b2's scope by design. A third option since 41c1: turn on Supabase's own MFA factor notices (declared in `config.toml`, currently `enabled = false` because DubGrid's alert covers normal flows), which alert the owner of any enrollment or removal, including one made with a stolen token, at the cost of a duplicate email on an ordinary change.
**Resolution:**

### F-16 [P2] open - Gridmaster organization-role grants run without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:291`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** `assignOrgRoleByEmail` can grant Super Admin of any organization to any account on the Gridmaster session alone. It predates 41b3 and is organization rather than platform authority, so it sits outside 41b3's wording but close to its goal.
**Suggested fix:** Gate that action with `requireSensitiveActionAuth` and run it through step-up, and classify the route in the inventory. Needs a scope call.
**Resolution:**

### F-17 [P3] open - Gridmaster audit-log export runs without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/audit-log/export/route.ts:24`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The coding standards list export as a sensitive action; this export predates 41b3 and needs only the Gridmaster session.
**Suggested fix:** Gate with `requireSensitiveActionAuth` and step-up, or record why a platform audit export is exempt.
**Resolution:**

### F-18 [P3] unverified - The live MFA-policy integration test can lose its verified session under full-suite load

**File:** `apps/web/src/__tests__/mfa-enforced-in-policies.integration.test.ts:110`
**Found:** 2026-09-25 during 41b3's final gate (full `npm run test`)
**Why it matters:** The challenge verify returned no session once in a full run and passed in isolation (1/1). A TOTP window rollover or local Auth rate limit under parallel live tests are the likely causes; unproven.
**Suggested fix:** Generate the code for the verify moment and retry once on a window edge, or run the live tests serially.
**Resolution:**

### F-20 [P3] open - Saving notification preferences can lose a concurrent save

**File:** `apps/web/src/features/account/server/preferences.ts:31`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** The save reads, merges and upserts in three steps, so a mobile save and a web save at the same moment can drop one another's change. Before 41c1 a mobile save erased the web categories every time.
**Suggested fix:** Merge inside the database (`prefs = notification_preferences.prefs || excluded.prefs` in an RPC), which needs a migration.
**Resolution:**

### F-22 [P3] open - 41c1 test gaps: the remove-then-reconcile sequence and the push script's compare

**File:** `apps/web/src/__tests__/mfa-lifecycle.test.ts`; `scripts/push-auth-templates.ts:155`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** Each half of "a later reconcile sends nothing" is tested separately, not the sequence, and the script's boolean compare runs only in production use; a source-text check stands in for it.
**Suggested fix:** A test that removes the last factor and then reconciles; export the script's `diff` behind a main guard and test it.
**Resolution:**

### F-25 [P3] open - The once-per-session sign-in record is not atomic

**File:** `apps/web/src/lib/auth/sign-in-completion.ts:61`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Two concurrent completion calls can both read nothing and both write. The app's clients guard concurrent calls.
**Suggested fix:** A partial unique index on `(actor_id, details->>'sessionHash')` for successes, which needs a migration.
**Resolution:**

### F-26 [P3] open - Two concurrent impersonation ends can both be recorded

**File:** `apps/web/src/app/api/gridmaster/impersonation/route.ts:205`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The row is read before `end_impersonation`, whose second call is a silent no-op, so both requests write `impersonation.ended`.
Since 41c3 the route also sends the end notice, so a concurrent pair sends two emails as well.
**Suggested fix:** Have the RPC return whether it ended a row (migration).
**Resolution:**

### F-28 [P3] open - A host-organization denial after the second factor is not recorded

**File:** `apps/web/src/app/(app)/login/OrgLogin.tsx:236`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** On the web two-factor path the client finds no membership, signs out locally and shows a toast; the log ends at the challenge. Predates 41c2.
**Suggested fix:** A server-side refusal record for this case, for example a denial reason on the local sign-out.
**Resolution:**

### F-29 [P3] open - A sign-in refused by the access-token hook writes no audit row

**File:** `apps/web/src/app/api/auth/login/route.ts:445`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The `ACCOUNT_DISABLED` branch returns 403 with no record although the password was correct. Predates 41c2.
**Suggested fix:** Record it as `rejected` with a disabled-account reason (no session exists to end).
**Resolution:**

### F-32 [P3] open - Any signed-in user can insert audit rows as themselves

**File:** `supabase/migrations/003_rls_policies.sql:1204`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** `authenticated_insert_audit_log` lets a user write any `action` and `details`, including a `security.auth.login` success with their own `sessionHash` that would suppress the real record. Predates 41c2.
**Suggested fix:** Restrict inserts to server-written actions (a migration), or move security evidence to a table only the service role writes.
**Resolution:**

### F-33 [P3] open - The proxy's escape end of an impersonation is not audited

**File:** `apps/web/src/proxy.ts:478`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Visiting `/gridmaster` while impersonating ends the row with reason `navigation` and records nothing. Kept out of 41c2 so the middleware gains no service-role write.
**Suggested fix:** Record it from a route or a job (the 41c3 notice work may carry it).
**Resolution:**

### F-35 [P3] open - A Gridmaster sign-out ends an impersonation with no end notice

**File:** `apps/web/src/app/api/account/logout-cleanup/route.ts:24`; `apps/web/src/features/account/server/sessions.ts:47`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** Sign-out deletes the Gridmaster's impersonation rows, live ones included: no end email, no in-app notice, and the history is gone.
**Suggested fix:** End live sessions through `end_impersonation` and send the end notice before deleting, or keep the rows.
**Resolution:**

### F-38 [P3] open - In-app impersonation notices still say a platform administrator is reviewing the account

**File:** `supabase/migrations/002_functions_triggers.sql` (`start_impersonation`, `end_impersonation`)
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The same event reads as "DubGrid support is using your account" by email and as "A platform administrator is currently reviewing your account" in the app.
**Suggested fix:** A forward migration rewording the two RPCs' notification text.
**Resolution:**

### F-41 [P3] open - Stale references to the retired notify route, and no rate limit on impersonation notices

**File:** `apps/web/e2e/role-variance-impersonation.spec.ts:101`; `internal/api-reference.md:195`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The e2e spec and the API reference still describe `/api/notify-impersonation`, and the old route's `apiLimiter` has no counterpart, so repeated start and end cycles email the person each time (each still needs a justification and writes an audit row).
**Suggested fix:** Update the two references when the documentation work lands; consider a per-target limit on starts.
**Resolution:**
