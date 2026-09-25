# Feature: Impersonation notices and auth email copy

**From build-plan:** feature 41c3
**Status:** verified

## Goal

A person whose account is used by DubGrid support should hear about it every
time, exactly once, in plain words, and every auth email should say when its
link expires and what to do if the change was not theirs. Today the browser
sends the impersonation notices: a closed tab, a navigation or the Gridmaster
panel's own End button means no email, and a Gridmaster can send the same
notice repeatedly. The notice defers to "your organization administrator",
prints the Gridmaster's free-text reason, calls signing in as the person
"reviewing", and never says how long the access lasts. The email-change and
reauthentication emails omit their expiry, the two-factor alert says nothing
when two-factor is turned on without the person, and security alerts carry a
"manage your notification preferences" footer for alerts that are always on.

## In scope

- **The server sends impersonation notices, once each.** The Gridmaster
  impersonation route sends the start notice when a session starts and the
  end notice when an end actually ends one, after the response. Each state
  change happens once, so each notice goes once. The browser no longer sends
  them, and `/api/notify-impersonation` answers 410 Gone.
- **The notice says what happened, plainly.** DubGrid support signed in as the
  person in the named organization, until at most a stated time in the
  organization's timezone; the end notice says the access ended. No free-text
  reason, no actor, and "If you weren't expecting this, contact
  support@dubgrid.com."
- **Auth emails state their expiry.** The email-change and reauthentication
  templates say the link or code expires in 1 hour, as recovery does, from
  `otp_expiry`.
- **A two-factor change the person did not make has a next step.** The alert
  for two-factor turned on says to contact support@dubgrid.com if it was not
  them, and so does the (disabled) Supabase enrolled template.
- **Security alerts carry no preferences footer.** Their email says security
  alerts are always on.
- **The drift check covers app-sent auth mail.** A test renders every email
  the app sends about a sign-in and holds them to the same rules as the
  Supabase templates: no dashes or ellipsis characters, no deferral to an
  administrator for an account-global action, no actor, and a "wasn't you"
  line with an action on every notice.

## Out of scope

- A notice when a session expires without an end, or ends through the proxy
  escape (a job; recorded as a finding).
- Deleting `/api/notify-impersonation`: it answers 410 until the owner
  decides to remove it.
- Pushing regenerated Supabase templates to production (release step).

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - server-sent impersonation notices** - start and end send
      from the route through `after()`; the browser calls stop; the notify
      route answers 410. _Done when:_ route tests prove one notice per start
      and per real end, none for a refused end, and none when the provider is
      unconfigured.
- [x] **Step 2 - the notice copy** - rewrite `ImpersonationNoticeEmail` and
      its subjects. _Done when:_ render tests prove the time bound, the
      support line, and that no reason, actor or administrator appears.
- [x] **Step 3 - expiry and "wasn't you" lines in auth emails** - email
      change, reauthentication and the enrolled template; regenerate the
      Supabase HTML. _Done when:_ the template test requires the expiry lines
      and the regenerated HTML matches.
- [x] **Step 4 - security alert email** - always-on footer and the two-factor
      turned-on line. _Done when:_ sender and event tests prove both.
- [x] **Step 5 - drift check for app-sent auth mail** - _Done when:_ the new
      test covers every app-sent auth email and fails on a planted violation.
- [x] **Step 6 - audit repairs** - F-34 (notices before the audit write),
      F-36 (the drift check renders the real alerts, which now name support),
      F-37 (copy), F-39 (tests) and F-40 (warn without a provider). _Done
      when:_ each has a test that fails without it.

## Files / areas

- `apps/web/src/app/api/gridmaster/impersonation/route.ts`,
  `app/api/notify-impersonation/route.ts`, `components/ImpersonationBanner.tsx`,
  `components/gridmaster/EnhancedImpersonation.tsx`.
- `apps/web/src/emails/ImpersonationNoticeEmail.tsx`, `emails/auth/*.tsx`,
  `emails/NotificationEmail.tsx`, `supabase/templates/`.
- `features/notifications/server/events.ts`, `sender.ts`.

## Data / contracts

- No migration. `/api/notify-impersonation` becomes 410.

## Testing

- Route, render, template and sender tests per step.

## Notes for the AI

- Emails are safe if misaddressed: never name the actor; resolve recipients
  server-side.
- Customer copy says "Organization" and "DubGrid support"; never "workspace".
- No em dashes, en dashes or ellipsis characters.

## Verification notes

- Full `npm run test` (mobile 1324/1324) and `npm run build` passed; after
  keeping the retired route behind the Gridmaster check, `npm run test:web`
  passed 4630/4630.
- The regenerated Supabase templates are local until the push script runs
  against production (release step).
- No email was delivered through a real provider; render tests prove the
  copy (41d3 rehearsal).
- `/api/notify-impersonation` answers 410 behind CSRF and the Gridmaster
  check. Deleting it is the owner's call.

## Findings

### 41c3/F-34 [P3] closed - A failed audit write dropped the impersonation notice

**File:** `apps/web/src/app/api/gridmaster/impersonation/route.ts:188`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The notice was scheduled after `writeGridmasterAuditLog`, which throws; an end whose audit failed returned 500 and its retry found the session ended, so the person never heard.
**Suggested fix:** Schedule the notice before the audit write.
**Resolution:** Both notices are scheduled right after the RPC; a route test fails the audit insert and still sees the end notice. Re-review (7fb3786e): closed. Tests since added for a failed start audit and for RPC errors sending nothing.

### 41c3/F-36 [P3] closed - The sign-in email drift check did not render the real security alerts

**File:** `apps/web/src/emails/app-auth-emails.test.tsx:92`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** It rendered a message typed into the test; the real new-sign-in and two-factor-off messages had no support address, and the forced sign-out had no "wasn't you" line. The list was also hand-kept.
**Suggested fix:** Render the real messages and require every email file to be listed or exempted.
**Resolution:** The test dispatches the four security events through the real dispatcher and renders what they send; every `*Email.tsx` must be listed or exempted with a reason. The three messages now name support@dubgrid.com. Removing the new-sign-in support line fails the test. Re-review (7fb3786e): closed.

### 41c3/F-37 [P3] closed - The impersonation email claimed a support request, and the forced sign-out said "administrator"

**File:** `apps/web/src/emails/ImpersonationNoticeEmail.tsx:51`; `apps/web/src/features/notifications/server/events.ts:1282`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** "to help with a support request" claims a request that may not exist, and the forced sign-out alert still said a platform administrator did it.
**Suggested fix:** Drop the claim; word the forced sign-out as DubGrid support.
**Resolution:** Done: "DubGrid support is using your account in {Organization}." and "DubGrid support signed you out". Re-review (7fb3786e): closed.

### 41c3/F-39 [P3] closed - Two 41c3 tests could pass without the behavior

**File:** `apps/web/src/app/api/gridmaster/_lib/impersonation-notice.test.ts:73`; `apps/web/src/app/api/gridmaster/impersonation/route.test.ts:335`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The "sends nothing" test waited only for `after` to be called, not for its task; the read-back failure case did not check the notice.
**Suggested fix:** Await the scheduled tasks; assert the notice.
**Resolution:** The `after` mock collects task promises and the test awaits them; the read-back case asserts a notice with no organization. Re-review (7fb3786e): closed.

### 41c3/F-40 [P3] closed - A missing email provider silently skipped impersonation notices

**File:** `apps/web/src/app/api/gridmaster/_lib/impersonation-notice.ts:43`
**Found:** 2026-09-25 by `/audit` (scope: current, 262cddb3..1ddf878f; all lenses)
**Why it matters:** The old route answered 500 without a provider; the helper returned without a trace, so a production misconfiguration would never show.
**Suggested fix:** Log a warning; move the Resend config getter somewhere shared.
**Resolution:** It logs a warning, tested. The getter still lives in `features/mobile/server/invitation-email`, as other senders use it. Re-review (7fb3786e): closed.
