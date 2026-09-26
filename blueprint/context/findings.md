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

### F-08 [P2] closed - Credential mutations bypass DubGrid's five-minute assurance for a token holder (research G1)

**File:** `apps/web/src/features/account/client/auth.ts:86`; `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx:248`; `apps/web/src/features/account/server/mfa-lifecycle.ts:114`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** Password and sign-in email changes are direct Supabase calls, and the factor endpoints DubGrid proxies stay reachable with the same JWT, so the assurance is a client preflight. A stolen access token can change the password (Supabase still requires aal2 when a factor exists) or, on an account with no factor, enroll an attacker's authenticator and lock the owner out, skipping DubGrid's audit. Moving the calls into DubGrid routes would not close it.
**Suggested fix:** A decision for the owner: database triggers on `auth.users` and `auth.mfa_factors` that audit, revoke or alert on credential changes, and/or a shorter `jwt_expiry`. Out of 41b2's scope by design. A third option since 41c1: turn on Supabase's own MFA factor notices (declared in `config.toml`, currently `enabled = false` because DubGrid's alert covers normal flows), which alert the owner of any enrollment or removal, including one made with a stolen token, at the cost of a duplicate email on an ordinary change.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: Supabase's own MFA factor notices are enabled in `config.toml` (sent by Supabase, so a change made with a stolen token still reaches the owner), and DubGrid's two-factor alert pushes only (`sendEmail: false`) so an ordinary change sends one email. Production takes effect when the auth templates and flags are pushed, which must happen before the release merges. A shorter `jwt_expiry` was not chosen. Revised after audit (a6e3c15c): nothing yet shows Supabase sends the MFA notices, so DubGrid's own two-factor alert keeps emailing (the push-only change is reverted) and an ordinary change may send two emails until production is confirmed. Re-review (a6e3c15c..d6b802ca): closed.

### F-16 [P2] closed - Gridmaster organization-role grants run without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:291`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** `assignOrgRoleByEmail` can grant Super Admin of any organization to any account on the Gridmaster session alone. It predates 41b3 and is organization rather than platform authority, so it sits outside 41b3's wording but close to its goal.
**Suggested fix:** Gate that action with `requireSensitiveActionAuth` and run it through step-up, and classify the route in the inventory. Needs a scope call.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: `assignOrgRoleByEmail` requires `requireSensitiveActionAuth` before the RPC, the Users tab runs it through step-up with the credential preflight, and the inventory classifies the route `conditional-sensitive`. Audit (a6e3c15c) found the Users tab's role dropdown still reached `change_user_role` on the access route unguarded; a Gridmaster role change there now requires fresh proof too, through step-up, and the inventory pins it. Re-review (d6b802ca) kept it open: `/api/organizations/role-change` also calls `change_user_role` ungated. It now requires fresh proof for every caller (no screen calls it), the inventory marker includes `change_user_role`, and a test proves a stale session changes nothing. Re-review (7ba79e75): closed as scoped, direct role grants: `assignOrgRoleByEmail`, the access route for a Gridmaster and the role-change route all require fresh proof, and mobile refuses Gridmaster tokens outright. Grants through invitations and direct database access are recorded as F-59 and F-60.

### F-17 [P3] closed - Gridmaster audit-log export runs without fresh assurance

**File:** `apps/web/src/app/api/gridmaster/audit-log/export/route.ts:24`
**Found:** 2026-09-25 by `/audit` (scope: current, 2f001cb4..e24134f8; all lenses)
**Why it matters:** The coding standards list export as a sensitive action; this export predates 41b3 and needs only the Gridmaster session.
**Suggested fix:** Gate with `requireSensitiveActionAuth` and step-up, or record why a platform audit export is exempt.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: the export requires `requireSensitiveActionAuth` before reading rows, the compliance view runs it through step-up, and the inventory classifies the route `sensitive`. Re-review (a6e3c15c..d6b802ca): closed.

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

### F-42 [P2] closed - Arming the app lock only on background could leave content in the iOS app switcher

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:119`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** iOS goes inactive in the app switcher and snapshots soon after; with only `background` arming the lock, the cover could arrive after the snapshot, showing schedule and people data. Not verified on a device.
**Suggested fix:** Cover the app on `inactive` without locking or prompting.
**Resolution:** `inactive` raises the privacy cover (no lock, no prompt); `active` lowers it; `background` still locks. A provider test covers it. The switcher snapshot needs the 41d3 device rehearsal. Re-review (d4a48aa5): kept open, since the cover could stay up after a sign-out while covered; the effect's cleanup now lowers it, with a test that fails without it. iOS only: Android reports no `inactive`, and its recents snapshot stays unprotected (that needs `FLAG_SECURE`). Second re-review (fe8c51ee): kept open at the repair limit (two attempts). The cleanup that lowers the cover also runs when the token rotates while the app is inactive, so a manual refresh already in flight when the switcher opens drops the cover until `background`. Suggested next fix: key the effect on `Boolean(accessToken)` instead of the token, with a test that rotates the token after `inactive`. Owner delegated the decision (2026-09-25); fixed in 41d3 with the recorded next step: the effect is keyed on `Boolean(accessToken)`, so a token rotation no longer re-runs its cleanup; a test rotates the token while inactive and fails without the change. Re-review (a6e3c15c..d6b802ca): closed.

### F-46 [P3] open - A detection error in the new-sign-in claim loses the alert without a retry

**File:** `apps/web/src/features/account/server/security-alerts.ts:74`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** `claimNewSignIn` catches a database error and returns no claim, and the route still answers 200, so the client never retries and the alert is gone.
**Suggested fix:** Answer 5xx when detection fails so the client retries, or record the failure for a later sweep.
**Resolution:**

### F-47 [P2] closed - The app's password rule accepts passwords Supabase's rule refuses

**File:** `packages/domain/src/password.ts`; `supabase/config.toml` (`password_requirements = "letters_digits"`)
**Found:** 2026-09-25 during 41d2 (drift review; recorded, not built)
**Why it matters:** `isPasswordAcceptable` wants 10 characters and two of uppercase, digit or symbol, so `Abcdefghij!` passes both apps and the register route, but Supabase requires a digit and refuses it at sign-up or reset. Production's setting is unverified.
**Suggested fix:** A policy decision: require a letter and a digit in the app rule (and its hints and copy on web and mobile), or relax Supabase's requirement to match the app. Then add a test that parses `config.toml` and holds the two together.
**Resolution:** Owner delegated the decision (2026-09-25); fixed in 41d3: the app rule requires a letter and a number (the hint reads "Letter and number") plus an uppercase letter or a symbol, so it can never accept what `letters_digits` refuses; `password-policy.test.ts` holds it against `config.toml`. Audit (a6e3c15c) found the meter still said "Fair" for refused passwords and the guidance copy omitted the number; the level is capped at Weak for any refused password and the copy names a letter and a number. Re-review (a6e3c15c..d6b802ca): closed.

### F-50 [P3] open - Remaining drift-guard gaps

**File:** `apps/web/src/__tests__/invitation-sql-contract.test.ts:41`; `access-token-hook-claims.test.ts`; `apps/web/src/emails/InviteEmail.tsx:72`; `apps/web/src/app/page.tsx:93`; `apps/web/src/__tests__/push-auth-templates.test.ts`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** The SQL messages are copied into the test rather than read from the route; `VerifiedClaims` and the api-auth `Claims` (which add `in_sandbox`) are not in the claim check; the 72 hours in invite and landing copy is not tied to `INVITATION_LIFETIME_HOURS`; the new tests assume they run from `apps/web`; and the push test mirrors the script's Management API field names, so a wrong name would pass.
**Suggested fix:** Read the matched strings from the route; add `VerifiedClaims` with an `in_sandbox` allowance; derive the copy from the constant; use `supabaseMigrationsDir()`-style root resolution; check field names against the Management API schema in 41d3.
**Resolution:**

### F-54 [P3] fixed - The web test cache hashed the Supabase CLI's gitignored state

**File:** `turbo.json` (`@dubgrid/web#test`)
**Found:** 2026-09-25 by `/audit` re-review of cd8758d8
**Why it matters:** Turbo's explicit input globs ignore `.gitignore`, so `supabase/.temp/**` (rewritten by the CLI on update checks, `link` and `start`) caused cache misses with no source change, and local hashes differed from CI's. Never a wrongly replayed pass.
**Suggested fix:** Exclude `supabase/.temp` and `supabase/.branches`.
**Resolution:** Both are negated in the inputs; a dry run shows no `.temp` file.

### F-56 [P3] open - No view tests for the 41d3 step-up wiring

**File:** `apps/web/src/components/gridmaster/organization-detail/UsersTab.tsx`; `apps/web/src/components/gridmaster/GridmasterComplianceView.tsx`
**Found:** 2026-09-25 by `/audit` of a6e3c15c
**Why it matters:** Hiding the confirmations behind the step-up dialog, clearing loading on cancel, and downloading nothing without assurance are proven only by reading.
**Suggested fix:** View tests in the pattern of `GridmasterAccountsView.test.tsx`.
**Resolution:**

### F-57 [P3] unverified - The app's password rule has no maximum where Supabase may refuse long passwords

**File:** `packages/domain/src/password.ts`
**Found:** 2026-09-25 by `/audit` of a6e3c15c
**Why it matters:** Supabase Auth likely refuses passwords over 72 characters (bcrypt), which the app would accept, the same drift F-47 closed for character classes.
**Suggested fix:** Confirm the limit and add it to the rule and the policy test.
**Resolution:**

### F-60 [P2] open - A Gridmaster token can change memberships and invitations directly in the database

**File:** `supabase/migrations/003_rls_policies.sql:117`, `:751`; `016_harden_authorization_boundaries.sql:79`; `043_invitation_inviter_is_verified.sql:250`
**Found:** 2026-09-25 by `/audit` re-review of 7ba79e75
**Why it matters:** `change_user_role`, `assign_org_role_by_email` and `send_invitation` are executable by `authenticated`, and the `gridmaster_all_memberships` and `gridmaster_all_invitations` policies are FOR ALL, so a Gridmaster token can insert a Super Admin membership through PostgREST, skipping every route gate. The same class as F-08; `is_gridmaster()` needs aal2 but not a recent sign-in.
**Suggested fix:** A decision with F-08: narrow the Gridmaster policies to SELECT and route writes through server-only functions, or require a recent authentication in the RPCs.
**Resolution:**

### F-62 [P2] open - Turning on `secure_password_change` would refuse password changes for two-factor users on sessions older than a day

**File:** `apps/web/src/features/account/client/step-up.ts:44`; `apps/mobile/src/features/profile/lib/step-up.ts:62`; `supabase/config.toml` (`secure_password_change = true`)
**Found:** 2026-09-26 during 41d3's production Auth review
**Why it matters:** Supabase Auth v2.187.0 (`internal/api/user.go:154`) refuses a password update without a reauthentication nonce when the current session started more than 24 hours ago. DubGrid's password step-up replaces the session, so it passes; its authenticator-code step-up keeps the old session, and neither app sends a nonce. Mobile sessions now last until sign-out, so with the setting on, a two-factor user could not change their password on mobile after the first day. Production has it off; local `config.toml` has it on, which the fresh sessions in tests never reach.
**Suggested fix:** Keep it off in production. Before turning it on, either send Supabase's reauthentication nonce with the update or have the authenticator-code step-up issue a fresh session; then set local and production alike.
**Resolution:**

### F-68 [P3] fixed - Management-department grants by a Gridmaster run without fresh proof

**File:** `apps/web/src/app/api/organizations/invitations/route.ts` (PATCH `deptAdminIds`); `apps/web/src/app/api/organizations/app-only-user/route.ts`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** Department-admin assignments are a smaller grant of the same kind F-61 gated for permissions.
**Suggested fix:** Gate a Gridmaster's department-admin changes like permission changes.
**Resolution:** Fixed in 41d3 (repair): the app-only-user route and the invitation edit require fresh proof when a Gridmaster changes the department or department-admin set (compared as sets, so a save that leaves them alone asks nothing); the People management screens run those saves through step-up, and the editor revokes a pending invitation only after both prompted steps. Route tests cover a stale session, an unchanged set and an ordinary admin; the inventory classifies the app-only-user route.

### F-69 [P3] open - Test gaps in the 41d4 step-up wiring

**File:** `apps/web/src/__tests__/GridmasterUsersTab.test.tsx`; `apps/web/src/components/staff/MemberAccessControls.tsx`; `apps/web/src/components/gridmaster/OrganizationSetupWizard.tsx`
**Found:** 2026-09-26 by `/audit` of e42da4bd..821c7ff4
**Why it matters:** Nothing covers a step-up retry that runs the action twice, `PermissionsEditor` staying open when a save is cancelled, `MemberAccessControls`' own cancel, or the wizard's invitation-step cancel.
**Suggested fix:** Add those view tests. Also: a behavior test that replace-access omits the token, `isGridmasterActor` throwing on a read error, the reinvite info toast, and the revoke-after-role-change order.
**Resolution:**

### F-71 [P2] fixed - `send_invitation` returns a token to a direct authenticated caller

**File:** `supabase/migrations/043_invitation_inviter_is_verified.sql:250`; `apps/web/src/app/api/gridmaster/organizations/manage/route.ts:469`
**Found:** 2026-09-26 by `/audit` re-review of 58ff57cd (predates 41d4)
**Why it matters:** An Admin who manages employees can call the RPC through the data API and receive the new invitation's token, then register a pre-confirmed account at an address they do not own. No tier escalation (the function's tier check holds), but the address is not proven. The same class as F-60.
**Suggested fix:** Move the setup wizard's call to the service client with `p_invited_by`, then revoke EXECUTE on `send_invitation` from `authenticated` in a forward migration and update the SQL entry-point allowlist.
**Resolution:** Fixed in 41d3 (repair): migration `050_send_invitation_server_only.sql` revokes EXECUTE on `send_invitation` from `authenticated`; the Gridmaster setup route calls it as the service role with `p_invited_by`, like invitations/create. The SQL entry-point allowlist now honours a later revoke, and the live check proves `authenticated` cannot execute it. Production needs 050 applied by the runbook.
