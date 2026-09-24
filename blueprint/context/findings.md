# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P2] open - Deleting a long series reads only its first 1,000 cells, orphaning shift notes

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1484`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: performance)
**Why it matters:** The read of a series' cells before `delete_shift_series` is unpaged, and `db.max_rows = 1000` (`supabase/config.toml:18`) applies to every role including `service_role`. The rows feed `clearScheduleNotesForCells`, and `schedule_notes` has no foreign key to the cell, so notes on cells past the first 1,000 survive the deletion and render an indicator against a shift that no longer exists. This is the same class as the already-repaired F-11 truncation, and it violates the standing rule that every shift-removal path clears notes. Only reachable while F-02 stands, since 183 occurrences cannot cross the cap; it is recorded separately because raising the legitimate series ceiling would reintroduce it even after F-02 is clamped.
**Suggested fix:** Page the read with `.range` in a deterministic order, reusing the pager shape already used by `fetchNormalizedPublishedShiftRows` and `fetchScheduleCellQueryRows`.
**Resolution:**

### F-05 [P3] open - Six integration claim builders hardcode the enrollment claim with no override

**File:** `apps/web/src/__tests__/draft-state-editor-only.integration.test.ts:124` and the same `asUser` helper in `row-level-trust-boundaries`, `employee-contact-columns`, `auto-approve-shift-requests`, `schedule-children-org-consistency` and `role-escalation-guards`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: tests)
**Why it matters:** The F-01 repair added `mfa_enrolled: false` to each of these literal claim objects, which is right (it is what a real token carries) but fixed: unlike `org-isolation`, whose setter spreads `{ mfa_enrolled: false, ...claims }` so a test can override it, these six cannot express an enrolled caller at all. Any future case in those files that wants to prove a policy refuses an unchallenged enrolled member has to edit the shared helper first, which is the kind of friction that ends in the case not being written.
**Suggested fix:** Give each `asUser` an optional claims override merged the way `org-isolation` does, or lift one shared helper into `__tests__/helpers/` and have all seven use it.
**Resolution:**

### F-06 [P3] open - change_user_role runs under the service role, so its own tier guards never fire

**File:** `apps/web/src/app/api/organizations/access/route.ts:276`; `packages/data-access/src/mobile.ts:1693`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security)
**Why it matters:** Both callers invoke the RPC with the service client, which has no `auth.uid()`, so the RPC's identity, caller-tier and admin-tier checks pass vacuously. This is documented at `packages/data-access/src/mobile.ts:1677` and the compensating application checks are real and were verified in this pass: the web route gates on `isGridmaster || isSuperAdmin` (`requirePrivilegedActor`), and the mobile gate's `canManageUsers` resolves to `isSuperAdmin || isGridmaster` and is false under impersonation (`packages/authz/src/index.ts:273`). So this is not currently exploitable and is recorded as defence in depth only: the database layer would not catch a future route whose gate drifted below super admin.
**Suggested fix:** Call the RPC with the user client at both sites so both layers are live, as the already-decided follow-up in the archived plan describes. The guards that do not read `auth.uid()` (expected-updated-at, self-action, last-super-admin) are unaffected either way.
**Resolution:**

### F-07 [P3] fixed - Consumed invitation links show the acceptance form before failing

**File:** `apps/web/src/app/(app)/accept-invite/page.tsx:68`
**Found:** 2026-09-23 by focused source review (scope: invitation acceptance; lens: quality)
**Why it matters:** The initial invitation lookup correctly rejects accepted, expired, revoked, and unknown tokens with the same opaque response, but the page treats that failure as best-effort and still shows the account-creation form. A person using a consumed link can fill the form before learning that the invitation is no longer valid.
**Suggested fix:** Render the generic invalid-invitation state as soon as lookup returns the dead-invitation contract, while preserving indistinguishable messaging for accepted, expired, revoked, and unknown tokens. Add page coverage proving the form never appears for a dead token.
**Resolution:** Fixed on `dev` in `cfa5b088`. The accept page waits for the invitation lookup before rendering anything. The dead-token response shows one "Invitation no longer valid" state, identical for accepted, expired, revoked and unknown links, with a sign-in route. A lookup outage still shows the form, since acceptance re-checks the token. Page tests cover all three outcomes, and the three-browser E2E opens a revoked link (no form) and a live one.

### F-08 [P0] fixed - An employee-managing admin can promote a pending invitation to Super Admin

**File:** `apps/web/src/app/api/organizations/invitations/route.ts:31`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: security)
**Why it matters:** `PATCH` accepts `roleToAssign: "super_admin"`, but its only authorization is `requirePrivilegedActor`, which deliberately admits a regular admin with `canManageEmployees` (`route.ts:87`). The service-role update at `route.ts:387` rewrites `role_to_assign` without changing `invited_by`. If the pending invitation was originally created by a still-active Super Admin or Gridmaster (mobile-created rows do preserve that inviter), the acceptance guard at `supabase/migrations/033_row_level_trust_boundaries.sql:149` sees the old privileged inviter and grants the recipient Super Admin. A regular admin can therefore cross the tenant's highest privilege boundary with a crafted PATCH request.
**Suggested fix:** Require a live Super Admin or Gridmaster for every transition to `super_admin`, including PATCH and `replace_access`; enforce the same invariant in the database operation rather than relying only on the route; and add negative regular-admin tests plus positive Super Admin/Gridmaster acceptance tests.
**Resolution:** Fixed in 41a1, merged to `dev` in PR #104. The super-admin ceiling now applies to `PATCH` and `replace_access` through the shared `canAssignOrgRole` check (`1f648ec5`, `efb29875`), and migration 043 enforces it in the database via `inviter_may_grant`, so the route is not the only guard. Refusals are audited. Negative regular-admin and positive Super Admin tests cover both paths.

### F-09 [P1] fixed - Web-created Super Admin invitations have no inviter and can never be accepted

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:159`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: security)
**Why it matters:** The web route invokes `send_invitation` with the stateless service client and no inviter argument. The RPC writes `invited_by = auth.uid()` (`supabase/migrations/002_functions_triggers.sql:2841`), which is `NULL` under service role, while acceptance requires a still-privileged inviter for `super_admin` (`supabase/migrations/033_row_level_trust_boundaries.sql:149`). Live production inspection on 2026-09-24 found recent, time-valid Super Admin invitation rows with `invited_by = NULL`; they fail with the same opaque `INVITATION_INVALID` response used for expiry, even seconds after sending.
**Suggested fix:** Forward-migrate the RPC to require an explicit authenticated inviter, validate that actor's live tier, pass `user.id` from the route, and reissue affected live invitations after the fix. Add a service-role create-then-accept integration test.
**Resolution:** Fixed in 41a1, merged in PR #104. Migration 043 gives `send_invitation` an explicit inviter that it verifies against live membership and tier, and the create route passes the authenticated caller. A create-then-accept integration test covers every tier. Invitations already in production with `invited_by = NULL` still fail closed, and reissuing them is a release step for 41a3/41d.

### F-10 [P1] fixed - Invitation token rotation and email delivery are inconsistent across web and mobile

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:38`; `apps/web/src/features/mobile/server/routes/person-invitation.ts:409`; `apps/web/src/features/mobile/server/routes/management-user-invitation.ts:79`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: quality and security)
**Why it matters:** Duplicate web creation rotates the live token before the client separately sends email (`InviteEmployeeModal.tsx:243`), so every retry invalidates earlier mail and a delivery failure strands the recipient. Mobile staff resend does the reverse—emails the token before the optimistic database commit—so a conflict can deliver a token that was never stored. Management resend and same-role management-access edits commit a new token before email without restoring the previous row on failure (`person-management-access.ts:217`). Organization setup swallows delivery errors but increments `sentCount` (`components/gridmaster/organization-setup/persistence.ts:391`). These are independent ways for a link to appear "expired" immediately, and repeated invites amplify the problem.
**Suggested fix:** Consolidate every create/resend/access-change path on one idempotent server primitive or durable outbox that activates exactly the token known to have been delivered, with guarded compensation for ambiguous provider failures. Preserve the last delivered token until the replacement is committed and add concurrency, timeout, and provider-failure tests for every caller.
**Resolution:** Fixed on `dev`. Every create, resend and access-change path now stores its link and emails it as one operation, and undoes what it changed if the email fails: 41a2 rotation in place with the whole grant restored (migrations 044 and 045); the web create route sending in the same request, removing a new invitation or restoring a refreshed one, with `/api/send-invite-email` removed (`bf9c8775`); Gridmaster setup sending the super admin's invitation at creation and counting only real sends (`bf9c8775`); and the three mobile resend and access paths storing first and restoring the previous link and departments on failure, with the refresh helper no longer reviving revoked rows (`375026de`). Route, component, live-database and three-browser E2E tests cover each path. Ambiguous provider failures (a send that timed out but was delivered) still resolve by removing or restoring, so such an invitee holds a dead link and needs a resend.

### F-11 [P1] fixed - Regular admins can create invitations but are categorically blocked from emailing them

**File:** `apps/web/src/app/api/send-invite-email/route.ts:72`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: authorization)
**Why it matters:** Invitation creation explicitly allows a regular admin with `canManageEmployees` (`organizations/invitations/create/route.ts:134`), but the separate email endpoint admits only a Super Admin or Gridmaster. The UI creates the database row first, then deterministically receives 403 while sending the email, leaving an unsent pending invitation that retrying cannot fix.
**Suggested fix:** Authorize delivery with the same live organization permission used for creation while retaining the separate Super Admin assignment guard. Prefer the single create-and-deliver operation required by F-10 so the two checks cannot drift again.
**Resolution:** Fixed in 41a1, merged in PR #104 (`71490b44`). `send-invite-email` now authorizes on the same organization permission as creation, keeping the organization-scope check, and the Super Admin assignment guard is unchanged.

### F-12 [P1] fixed - Existing MFA users cannot accept a new organization invitation

**File:** `apps/web/src/app/(app)/accept-invite/page.tsx:126`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: quality and security)
**Why it matters:** The invitation page signs an existing account in with password and immediately calls the acceptance route, but it has no TOTP challenge or handoff. `requireAuthenticatedUser` correctly rejects an enrolled AAL1 token with `STEP_UP_REQUIRED` (`apps/web/src/lib/api-auth.ts:168`); the page then rewrites that policy response as "this invitation is no longer valid" and tells the user an account was created. MFA-enrolled clients are therefore unable to join another organization and receive a false expiry diagnosis.
**Suggested fix:** Reuse the normal login MFA challenge, preserve the invitation token through the handoff, continue acceptance only with the promoted session, and distinguish policy/network failures from the opaque dead-token contract. Add an existing-MFA-account end-to-end case.
**Resolution:** Fixed in 41a2 on `claude/lucid-hopper-exfpqt` (`7891f0a0`). The accept page hands a `STEP_UP_REQUIRED` refusal to the login page's `MFAVerify` and resumes acceptance on the promoted session. Backing out signs the password-only session out. Only the dead-token response is described as a dead link. Page, classifier, and three-browser E2E runs cover it; an existing-MFA-account browser case against a real factor remains for 41d.

### F-13 [P1] open - Mobile session termination bypasses DubGrid revocation and bulk assurance

**File:** `apps/mobile/src/features/profile/screens/ProfileSessionsScreen.tsx:116`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** Mobile logout, other/all-device sign-out, password change, password recovery, and forced teardown call the Supabase SDK directly. DubGrid verifies mobile JWTs locally and therefore relies on application revocation markers (`apps/web/src/features/mobile/server/auth.ts:63`); the web sign-out route explicitly documents that provider sign-out alone leaves copied access tokens valid until expiry (`apps/web/src/app/api/auth/sign-out/route.ts:41`). Mobile's bulk actions also skip the step-up used by per-device revoke. The UI can claim devices are signed out while their JWTs and `user_sessions` rows remain accepted, and a stolen unlocked session can trigger bulk sign-out without fresh proof.
**Suggested fix:** Add a bearer-authenticated mobile equivalent of `/api/auth/sign-out` for local/others/global scopes, write the app revocation markers before client cleanup, retain fresh assurance for bulk scopes, and allow the existing recovery-proof exception only for password recovery completion.
**Resolution:**

### F-14 [P1] open - Mobile sign-in email changes bypass fresh credential assurance

**File:** `apps/mobile/src/features/profile/screens/ProfileWorkScreen.tsx:353`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** Mobile calls `auth.updateUser({ email })` directly and can persist related name/work edits first. Web correctly runs the equivalent account-wide mutation through step-up and the five-minute credential-assurance preflight (`apps/web/src/components/account/ProfilePanel.tsx:485`). Anyone holding an unlocked mobile session can initiate a global sign-in-email change without password/TOTP confirmation, and the current-organization profile screen does not explain that the change affects every organization.
**Suggested fix:** Gate the whole email-changing save with `useMobileStepUpAction` and `requireMobileCredentialAssurance` before any write, then make the confirmation copy explicitly say it changes the DubGrid account across all organizations.
**Resolution:**

### F-15 [P1] open - Password-reset partial failures lose the mutation commit state

**File:** `apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx:136`; `apps/web/src/app/(app)/reset-password/page.tsx:168`
**Found:** 2026-09-24 by `/audit` (scope: password recovery; lens: security and quality)
**Why it matters:** Mobile races the provider password update against a non-cancelling 15-second deadline, sets `passwordUpdated` only when the race resolves, and revokes sessions afterward. A late provider success therefore changes the password but skips revocation and re-enables a blind retry. Web changes the password first, then performs global recovery completion in the same `try`; if revocation fails, it falsely says the password could not be updated even though `completeBrowserPasswordRecovery` has already cleared the local recovery session. Both flows lose the point at which the irreversible mutation may have committed.
**Suggested fix:** Move recovery completion behind an idempotent server operation/state machine or explicitly reconcile ambiguous late settlement. Once a password update has or may have committed, never show a password-update retry; complete/best-effort revocation, sign out locally, and tell the user to sign in with the new password and review sessions. Add late-settlement and post-update revocation-failure tests.
**Resolution:**

### F-16 [P1] open - Auth deletion failure leaves self-delete and GDPR erasure non-retryable

**File:** `apps/web/src/app/api/auth/delete-account/route.ts:125`; `apps/web/src/app/api/auth/gdpr-erase/route.ts:105`
**Found:** 2026-09-24 by `/audit` (scope: account lifecycle; lens: security and privacy)
**Why it matters:** Both endpoints remove memberships/application data before `auth.admin.deleteUser`. If the final Auth deletion transiently fails, the identity remains but its membership has gone; the next request fails the live `canDeleteAccountDirectly` check before it can retry the Auth deletion. The user is left with a valid identity that cannot complete its own deletion, after destructive cleanup has already occurred.
**Suggested fix:** Use an idempotent deletion saga with a durable retry record created before cleanup, or a carefully designed auth-first/tombstone flow that guarantees remaining cleanup can resume. Add failure injection followed by a successful retry for both endpoints.
**Resolution:**

### F-17 [P1] open - Mobile app lock fails open while SecureStore hydrates

**File:** `apps/mobile/src/shared/providers/AppLockProvider.tsx:89`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: security)
**Why it matters:** The persisted lock snapshot starts as `false`, hydration is asynchronous, the provider starts unlocked, and protected children always render. Startup readiness does not wait for lock hydration. A delayed, hung, or rejected SecureStore read can therefore lift the splash and expose authenticated content even though the user enabled app lock.
**Suggested fix:** Model the setting as `loading | enabled | disabled`, keep an opaque authenticated gate up until hydration resolves, handle read failure explicitly, and include lock readiness in startup release. Add delayed/rejected SecureStore cold-start tests and native-device snapshot checks.
**Resolution:**

### F-18 [P1] open - A stale mobile request can sign out a newer valid session

**File:** `apps/mobile/src/shared/lib/api.ts:126`
**Found:** 2026-09-24 by `/audit` (scope: mobile authentication; lens: concurrency)
**Why it matters:** Each request captures a bearer token, but any later 401 invokes a callback that discards the originating token and calls global auth teardown. Same-identity refresh deliberately leaves in-flight requests mounted, so a delayed 401 for token A after token B has been installed signs out whichever session is current, clears app state, and routes a valid user to login.
**Suggested fix:** Carry the request token/session identity into the failure handler, re-read the live session, and tear down only if it still matches. A stale request should fail locally without clearing newer auth state. Add refresh/org-switch races where the old request returns 401 last.
**Resolution:**

### F-19 [P1] open - New-sign-in and MFA security alerts can be systematically missed

**File:** `apps/web/src/app/api/auth/track-session/route.ts:47`
**Found:** 2026-09-24 by `/audit` (scope: authentication notifications; lens: security)
**Why it matters:** Web decides "new device" using only `(user_id, platform, device_label)`, but common labels collapse every Mac to `Macintosh` and every Windows device to `Windows PC`, so later machines do not alert. Mobile session presence never performs detection or dispatch at all. Web and MFA routes discard the async notification promise at the response boundary, while the sender applies one shared ten-email hourly cap across security and unrelated mail. Legitimate new sign-ins and MFA changes can therefore produce no out-of-band warning through four independent paths.
**Suggested fix:** Key a sign-in on the authenticated Supabase session ID before upsert, add mobile parity, enqueue alerts durably (or use a response-lifetime primitive), and reserve a security-alert budget with event-specific deduplication. Add same-label/different-session, mobile, response-completion, and mixed-volume throttle tests.
**Resolution:**

### F-20 [P1] open - Web logout can hang before revoking the session

**File:** `apps/web/src/app/(app)/goodbye/RunLogoutTeardown.tsx:77`
**Found:** 2026-09-24 by `/audit` (scope: sign-out and sessions; lens: security and reliability)
**Why it matters:** Logout awaits authenticated cleanup before it calls the server-backed sign-out, but `clearLogoutCleanup` uses an unbounded fetch (`apps/web/src/features/account/client/api.ts:175`). A half-open cleanup request leaves the CTA disabled and the access token unrevoked; on inactivity the page can already claim the user was signed out while teardown is still pending.
**Suggested fix:** Give cleanup a short hard deadline and move revocation/sign-out into a guaranteed continuation/finally path. Add a never-settling cleanup test proving local and server revocation still run.
**Resolution:**

### F-21 [P1] open - Manager-driven login-email changes leave the target's sessions and notices unmanaged

**File:** `apps/web/src/app/api/employees/manage/route.ts:719`
**Found:** 2026-09-24 by `/audit` (scope: account email changes; lens: security)
**Why it matters:** After step-up for the acting manager, the route changes a linked user's Auth email through `auth.admin.updateUserById` but does not revoke that target's existing DubGrid sessions or send application-controlled notices to the old and new addresses. A displaced or compromised session therefore retains access after an administrator changes its login identity, and the affected person receives no guaranteed organization-specific explanation from the app. Provider-native behavior was not treated as a substitute because it was not verified in this audit.
**Suggested fix:** Revoke all target sessions after the identity change, send durable notices to both addresses naming the organization and actor/action context, and define compensation for any partial failure. Add target-session and both-recipient notification tests.
**Resolution:**

### F-22 [P2] open - Auth and security emails lose organization context and use ambiguous account wording

**File:** `apps/web/src/features/notifications/server/sender.ts:209`; `apps/web/src/emails/auth/PasswordChangedEmail.tsx:9`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: quality and security)
**Why it matters:** `sendNotification` receives `orgId` but renders only a generic title/message, so "New sign-in on your account" omits the organization even though the route also captured browser, location, and time-capable metadata. Organization-scoped notification mail has the same central loss. Conversely, password/email/MFA/recovery templates describe the account generically and direct users to "your administrator" even though credentials are account-global and an org admin may not control them. Recovery omits the configured one-hour code expiry, and the reauthentication template says an unsolicited sensitive-action code can simply be ignored. The custom invitation email is the positive exception: it correctly names the organization and says 72 hours.
**Suggested fix:** Make optional organization context first-class in notification subjects/templates and include device, browser, location, and explicit event time for sign-ins. Phrase credential mail as "your DubGrid sign-in account"; when a verified initiating organization is available, name it as context (for example, "while signed in to {organization}"), but never imply it owns the credential or disclose organization counts/memberships. Route suspicious activity to session review/password reset/support, state code expiry, and keep the unused generic Supabase invite template disabled unless it can receive a verified org name.
**Resolution:**

### F-23 [P2] open - Login audit records can claim success before MFA and name the wrong organization

**File:** `apps/web/src/app/api/auth/login/route.ts:415`
**Found:** 2026-09-24 by `/audit` (scope: sign-in; lens: security observability)
**Why it matters:** An MFA-required password login skips post-sign-in orchestration but is still written as `outcome: "succeeded"` before the TOTP challenge completes. When orchestration switches organizations, the audit entry uses the original token's `claims.org_id` rather than the computed effective claims. Abandoned MFA challenges look like successful sign-ins and multi-org events can be attributed to the wrong tenant.
**Suggested fix:** Record a challenged/pending outcome after password verification, write success only after MFA completion, and pass the effective post-switch org ID into the audit event. Add abandoned-MFA and cross-org attribution tests.
**Resolution:**

### F-24 [P2] open - Corrupt persisted mobile auth can trap the user in a retry-only recovery loop

**File:** `apps/mobile/src/shared/providers/AuthSessionProvider.tsx:72`
**Found:** 2026-09-24 by `/audit` (scope: mobile session restoration; lens: resilience)
**Why it matters:** An unreadable access token clears query state and sets `restoreError`, but does not clear Supabase persistence. Other restore errors are only cleared for two exact refresh-token strings. The recovery screen labels the state as connectivity and offers only "Try again", so structurally corrupt storage can replay the same failure indefinitely until the user clears app data or reinstalls.
**Suggested fix:** Clear structurally unreadable auth automatically, broaden safe stale-token classification, or provide "Clear session and sign in again" alongside retry. Add malformed storage and non-matching provider-error tests.
**Resolution:**

### F-25 [P2] fixed - Impersonation notices trust recipient and organization wording supplied by the browser

**File:** `apps/web/src/app/api/notify-impersonation/route.ts:17`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: security)
**Why it matters:** The authenticated Gridmaster route accepts `targetEmail` and `targetOrgName` from the request and uses them directly in the recipient, subject, and body; the impersonation `sessionId` is consulted only after delivery for a best-effort IP update. A caller can therefore send a trusted DubGrid "account access" security notice to an arbitrary address with arbitrary organization wording, independent of the named session.
**Suggested fix:** Resolve recipient, organization, actor, justification, and session state from the authenticated Gridmaster-owned impersonation record before rendering or sending, and reject mismatched/closed sessions. Add tampered recipient/org tests.
**Resolution:** Fixed on `dev` in `5d88533d`. The browser sends only the event and session id. The route loads the session only for this Gridmaster on this device, requires it live for a start notice and ended for an end notice, and reads the recipient from the target account and the organization and reason from the database. Route tests cover a spoofed recipient, a foreign session and mismatched session states. The same email review removed the inviter's identity from invitation emails (`5aeb7911`).

### F-26 [P3] open - Auth-email source and deployable HTML can drift without CI noticing

**File:** `apps/web/scripts/generate-auth-email-templates.test.mts:1`
**Found:** 2026-09-24 by `/audit` (scope: authentication emails; lens: tests)
**Why it matters:** The React email generator writes `supabase/templates` in place and is outside the normal web test target; CI runs the `src` suite, while production sync reads the committed HTML. A wording, expiry, or security-link correction can therefore pass CI but leave the template that is actually pushed to Supabase unchanged.
**Suggested fix:** Add a non-mutating render-and-compare drift test to the normal verification path, covering all template bodies, subjects, and required Supabase placeholders. Keep the existing write mode as an explicit regeneration command.
**Resolution:**

### F-27 [P3] fixed - Several auth and invitation rate limits return an epoch as Retry-After

**File:** `apps/web/src/app/api/organizations/invitations/create/route.ts:98`
**Found:** 2026-09-24 by `/audit` (scope: authentication and invitations; lens: protocol correctness)
**Why it matters:** `checkRateLimit` returns `reset` as an epoch timestamp in milliseconds, but invitation create/edit/revoke/resend and account deletion divide it directly by 1,000 instead of subtracting `Date.now()`. A 429 can advertise a wait of roughly the current Unix timestamp in seconds—decades—rather than the remaining interval, misleading clients and retry infrastructure.
**Suggested fix:** Centralize `Retry-After` formatting as `max(1, ceil((reset - Date.now()) / 1000))` and replace every affected caller, with a unit test pinned to a known clock.
**Resolution:** Fixed in 41a2 on `claude/lucid-hopper-exfpqt` (`0846df8b`). One `retryAfterSeconds` helper computes `max(1, ceil((reset - now) / 1000))` for all 33 throttled routes. It is unit-tested on a pinned clock, and the route throttle tests now bound the header by the window.
