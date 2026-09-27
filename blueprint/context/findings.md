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

### F-50 [P3] open - Remaining drift-guard gaps

**File:** `apps/web/src/__tests__/invitation-sql-contract.test.ts:41`; `access-token-hook-claims.test.ts`; `apps/web/src/emails/InviteEmail.tsx:72`; `apps/web/src/app/page.tsx:93`; `apps/web/src/__tests__/push-auth-templates.test.ts`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** The SQL messages are copied into the test rather than read from the route; `VerifiedClaims` and the api-auth `Claims` (which add `in_sandbox`) are not in the claim check; the 72 hours in invite and landing copy is not tied to `INVITATION_LIFETIME_HOURS`; the new tests assume they run from `apps/web`; and the push test mirrors the script's Management API field names, so a wrong name would pass.
**Suggested fix:** Read the matched strings from the route; add `VerifiedClaims` with an `in_sandbox` allowance; derive the copy from the constant; use `supabaseMigrationsDir()`-style root resolution; check field names against the Management API schema in 41d3.
**Resolution:**

### F-62 [P2] open - Turning on `secure_password_change` would refuse password changes for two-factor users on sessions older than a day

**File:** `apps/web/src/features/account/client/step-up.ts:44`; `apps/mobile/src/features/profile/lib/step-up.ts:62`; `supabase/config.toml` (`secure_password_change = true`)
**Found:** 2026-09-26 during 41d3's production Auth review
**Why it matters:** Supabase Auth v2.187.0 (`internal/api/user.go:154`) refuses a password update without a reauthentication nonce when the current session started more than 24 hours ago. DubGrid's password step-up replaces the session, so it passes; its authenticator-code step-up keeps the old session, and neither app sends a nonce. Mobile sessions now last until sign-out, so with the setting on, a two-factor user could not change their password on mobile after the first day. Production has it off; local `config.toml` has it on, which the fresh sessions in tests never reach.
**Suggested fix:** Keep it off in production. Before turning it on, either send Supabase's reauthentication nonce with the update or have the authenticator-code step-up issue a fresh session; then set local and production alike.
**Resolution:**

### F-73 [P2] fixed - Production Supabase accepts public sign-ups on an invite-only product

**File:** `supabase/config.toml:165` (`enable_signup = true`); production auth config (`disable_signup: false`, read 2026-09-26)
**Found:** 2026-09-26 during the email review (read-only Management API read)
**Why it matters:** `internal/authentication.md` and `RBAC_SYSTEM_DESIGN.md` say email sign-up is off in production, but it is on. Anyone with the public publishable key can create and confirm an account through `/auth/v1/signup`, or through a sign-in link request, which also creates a missing user while sign-ups are open. The account has no organization, so RLS should still hide tenant data, but every RPC granted to `authenticated` becomes reachable by strangers.
**Suggested fix:** Set `disable_signup: true` on production (dashboard or Management API). Only `/api/invitations/register` creates accounts, through `auth.admin.createUser`, which ignores the setting. Local `config.toml` stays open for the integration tests that call `signUp`. Consider having `auth:templates:check` report the setting so it cannot drift again.
**Resolution:** Production set to `disable_signup: true` through the Management API on 2026-09-26 (read back true; email sign-in and confirmation unchanged). Local `config.toml` stays open for the integration tests. The drift check in `auth:templates:check` is not added yet.

### F-75 [P3] open - Database functions still let a stale Gridmaster token edit organization data

**File:** `supabase/migrations` (`check_admin_permission_for_org`, `is_authorized_org`, `publish_schedule` and the schedule, recurring and request functions that use them; `start_impersonation`; `force_logout_user`)
**Found:** 2026-09-26 while building 41d6
**Why it matters:** These SECURITY DEFINER functions are granted to `authenticated` and authorize a Gridmaster with `is_gridmaster()` alone, so a stale or stolen Gridmaster token can still edit schedules, publish, and settle requests in any organization by calling them through the data API. `start_impersonation` called directly also starts a session and its in-app notices without the route's audit row and email notice, and `force_logout_user` is gated in its route but not in the database. They are also how impersonated edits work, through routes that do not ask for fresh proof.
**Suggested fix:** A decision for the owner. Requiring `caller_has_fresh_proof()` for a Gridmaster in those checks closes it, but a Gridmaster editing schedules while impersonating would then be asked to confirm their identity every five minutes, and the schedule screens would need the step-up prompt wired in. Alternatively accept it: grants of authority and direct table writes are already closed (051 to 054).
**Resolution:** Narrowed by the owner's choice (2026-09-26, 41d7): migration 055 gives `start_impersonation` and `force_logout_user` the 051 guard, the impersonation route asks for fresh proof before a start (never before an end) and answers a database refusal with the prompt, and the portal runs the start through step-up; live tests prove both refuse a stale Gridmaster, work with fresh proof, and that a stale token still ends a session. Still open: the schedule, recurring, publish and request functions, left unchanged on purpose because fresh proof there would interrupt impersonated editing.

### F-78 [P3] open - A mobile sign-in that outlives the app's request timeout leaves an orphan server session

**File:** `apps/mobile` sign-in request (15 s client timeout); `apps/web/src/app/api/auth/login/route.ts`
**Found:** 2026-09-26 during the 41d3 Android rehearsal
**Why it matters:** On a slow server (18.6 s observed under load) the phone gives up while the server finishes, so a session is created that the phone never receives, and Security lists an extra signed-in device until it is revoked or expires.
**Suggested fix:** End the created session when the client has gone (for example, a short server-side deadline that signs the new session out), or let the next successful sign-in on that device replace the orphan.
**Resolution:**

### F-82 [P3] open - Month view misses a note filed under a person's secondary focus area

**File:** `apps/web/src/components/MonthView.tsx` (row building)
**Found:** 2026-09-26 by review of 42a
**Why it matters:** A general shift code is listed only under the person's primary focus area, so an indicator stored against another of their focus areas for that day never appears in the day popover. Rare: indicators are normally stored against the focus area the shift is in.
**Suggested fix:** Merge the person's marks from their other home focus areas into that row, deduplicated.
**Resolution:**

### F-83 [P3] open - Gridmaster realtime invalidation is not coalesced

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts`
**Found:** 2026-09-26 by review of the findings batch
**Why it matters:** The platform-wide subscription invalidates on every row event with no debounce, so a bulk import or invitation batch in any organization restarts an open person page's (and the platform summaries') fetch once per row. Gridmaster-only, and the summaries already behaved this way.
**Suggested fix:** Coalesce invalidations per query key over a short window before refetching.
**Resolution:**

### F-84 [P3] fixed - No index serves an organization's schedule notes by date

**File:** `supabase/migrations/001_schema.sql` (`schedule_notes` indexes)
**Found:** 2026-09-27 by review of 42b
**Why it matters:** The web schedule and, since 42b, every mobile team schedule read notes by `org_id` and a date range, ordered by date; with only `(org_id)`, `(emp_id)`, `(emp_id, date)` and `(indicator_type_id)` indexes, that scans the organization's whole note history. Fine at today's sizes.
**Suggested fix:** A forward migration adding an index on `(org_id, date)`.
**Resolution:** Fixed: migration `062_schedule_notes_org_date_index.sql` adds `idx_schedule_notes_org_date` on `(org_id, date)` and drops the single-column `idx_schedule_notes_org` it covers; checksum locked and `db:migrations:check` passes. Applied locally, where a week's read for an organization now plans as an index scan on the new index. Production needs 062 applied by the runbook; additive for readers, so it can go ahead of any release.
