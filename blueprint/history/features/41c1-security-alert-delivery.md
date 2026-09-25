# Feature: Security alert delivery

**From build-plan:** feature 41c1
**Status:** verified

## Goal

A security alert should reach the person whenever the event it describes
happened, on every device they use, and the settings should say truthfully
what can and cannot be turned off. Today a new sign-in alert is lost for good
if the session write fails after its claim; removing two-factor only alerts
when the client makes a second call; a Gridmaster force-logout alert can be
cut off when the function returns; security pushes reach only the devices
registered under one organization; an account deletion sends nothing; the
Supabase password and email change notices are declared in a form the CLI
ignores and are never enabled; and the web Security Alerts switches save
nothing while claiming to.

## In scope

- **A claimed sign-in always alerts.** Web `track-session` and mobile
  `session-presence` schedule the new sign-in alert as soon as the claim
  succeeds, before the session write, so a failed write cannot consume the
  claim without an alert.
- **Security pushes reach every device on the account.** For security types,
  push tokens are read by user across organizations, deduplicated by token,
  and sent even when the event has no organization.
- **Removing two-factor alerts from the server.** The shared MFA lifecycle
  handler, after removing the last verified factor, updates the profile flag
  and schedules `security_mfa_changed` itself, so the later client reconcile
  finds no change and does not send a second alert. The web status route
  names the organization from the verified session, not `profiles.org_id`.
- **The force-logout alert survives the response.** It runs through
  `scheduleSecurityAlert` (`after()`), not a bare `void` promise, and carries
  no organization: it ends every session on the sign-in, so it is a platform
  row every inbox shows, rather than naming the organization the target last
  switched to.
- **An account deletion sends a notice.** After a successful deletion on the
  self-service, GDPR erase and approved-request paths, the captured address
  gets "Your DubGrid account was deleted", naming no person and no
  organization.
- **Supabase's own password and email change notices are declared.**
  `config.toml` uses `[auth.email.notification.<type>]` with `enabled`,
  `subject` and `content_path`. Password and sign-in email changes are enabled
  (DubGrid sends nothing for them); the two MFA notices are declared disabled
  because DubGrid's own alert covers them. The push script reads the new
  sections and syncs the `mailer_notifications_*_enabled` flags with the
  templates. Applying it to production stays a release step.
- **Truthful preferences.** The web preference route accepts every category
  the web page shows, and a save merges with the stored map so a mobile save
  keeps web-only categories. Security alerts are always on: the row says so
  instead of offering switches, and the sender ignores any stored security
  preference.

## Out of scope

- A retry queue for sends that fail after scheduling (recorded as a finding).
- Sign-ins that never report to `track-session` (41c open finding).
- Audit attribution (41c2) and impersonation notices and auth copy (41c3).
- Applying the Supabase flags to production (41d rehearsal, needs approval).

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - a claimed sign-in always alerts** - web and mobile schedule
      the alert straight after the claim. _Done when:_ route tests prove a
      failing session write still schedules the alert, and a lost claim still
      sends nothing.
- [x] **Step 2 - security pushes reach every device** - account-wide token
      lookup for security types, deduplicated. _Done when:_ push tests prove a
      security push with no org or a different org reaches all of the user's
      active tokens once each, and non-security pushes stay org-scoped.
- [x] **Step 3 - removing two-factor alerts from the server** - lifecycle
      handler flag update and alert; web status route uses the session org.
      _Done when:_ lifecycle tests prove removing the last verified factor
      alerts once with the verified org, removing one of two does not, and a
      later reconcile sends nothing.
- [x] **Step 4 - the force-logout alert survives the response** - _Done
      when:_ the route test proves the alert is scheduled through `after()`.
- [x] **Step 5 - an account deletion sends a notice** - template, sender, and
      the three deletion paths. _Done when:_ render tests prove the copy names
      no person or organization; route tests prove a notice after success and
      none after a failed deletion.
- [x] **Step 6 - Supabase notices declared** - config, push script, template
      test. _Done when:_ the template test requires each notification section
      with its enabled value, the push script's diff includes the flags, and
      `supabase status` in the worktree parses the config.
- [x] **Step 7 - truthful preferences** - web schema, merge on save,
      always-on security row, sender ignores stored security. _Done when:_
      route tests prove web categories persist and a mobile save keeps them,
      the page shows security as always on, and sender tests prove a stored
      `security.email: false` still emails.
- [x] **Step 8 - audit repairs** - F-19 (a claim with no session row alerts
      only after its write lands) and F-21 (push comment). _Done when:_ route
      tests prove a failed no-row write and its successful retry alert once.

## Files / areas

- `apps/web/src/app/api/auth/track-session/route.ts`,
  `features/mobile/server/routes/session-presence.ts`.
- `packages/mobile-api-core/src/push.ts`, `packages/data-access/src/mobile.ts`,
  `features/notifications/server/sender.ts`.
- `features/account/server/mfa-lifecycle.ts`,
  `app/api/account/mfa-status/route.ts`.
- `app/api/gridmaster/users/[userId]/force-logout/route.ts`.
- `emails/AccountDeletedEmail.tsx` (new), a sender beside the deletion code,
  `app/api/auth/delete-account/route.ts`, `app/api/auth/gdpr-erase/route.ts`,
  `features/account/server/account-deletion.ts`.
- `supabase/config.toml`, `scripts/push-auth-templates.ts`,
  `emails/auth/supabase-templates.test.ts`.
- `app/api/account/notification-preferences/route.ts`,
  `features/account/server/preferences.ts`,
  `components/profile/NotificationPreferences.tsx`, `packages/contracts`.

## Data / contracts

- No migration. `notification_preferences.prefs` gains the web categories it
  always claimed to hold; `security` is never read for delivery.
- A new web preference update schema in `packages/contracts`; the mobile
  schema is unchanged.

## Testing

- Route, handler, push, sender, render and config tests per step.

## Notes for the AI

- Emails are safe if misaddressed: never name an actor, resolve recipients
  server-side.
- Organization context for an alert comes from verified claims or the verified
  session, never a request body or `profiles.org_id`.
- No em dashes.

## Verification notes

- Full `npm run test` (mobile 1324/1324, web 4543/4543 after the inventory
  fix) and `npm run build` passed on the final commit.
- `supabase status` in the worktree parses the new
  `[auth.email.notification.*]` sections. The running local stack was not
  restarted, so the notices themselves are unproven until the next
  `supabase start` (41d rehearsal).
- Browser evidence of the Security Alerts row was skipped: reaching the page
  needs a password sign-in, which the agent does not perform. The component
  test proves the row reads "Always on" and that a save omits `security`.

## Findings

### 41c1/F-19 [P3] closed - A failed session write could send the new sign-in alert more than once

**File:** `apps/web/src/features/account/server/security-alerts.ts:57`; `apps/web/src/app/api/auth/track-session/route.ts:56`; `apps/web/src/features/mobile/server/routes/session-presence.ts:63`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** When the hook created no `user_sessions` row, the claim wrote nothing, so scheduling the alert before the upsert meant each retry of a failed write claimed again and alerted again.
**Suggested fix:** Make the no-row path a real claim, or alert on it only after the write lands.
**Resolution:** `claimNewSignIn` returns `claimed` (the hook row was filled; alert at once) or `unrecorded` (no row; alert only after the report's write succeeds). Route tests prove an `unrecorded` report whose write fails stays quiet and its successful retry alerts once. Re-review (21572b34): closed. Two simultaneous first reports for a session with no row can still both alert; that race predates 41c1 and needs a deleted row within 15 minutes of sign-in.

### 41c1/F-21 [P3] closed - A push comment misdescribed the token table

**File:** `packages/mobile-api-core/src/push.ts:98`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** It said a device has a row per organization; `expo_push_token` is unique, so the dedupe is only defensive.
**Suggested fix:** Reword the comment.
**Resolution:** Reworded as a defensive dedupe. Re-review (21572b34): closed.
