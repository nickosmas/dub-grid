# Feature: Retry and teardown resilience

**From build-plan:** feature 41d1
**Status:** verified

## Goal

Auth plumbing that fails once should recover, and plumbing that succeeds
should not run again. Today a failed session report is never retried until the
next token (about an hour), which is past the 15 minutes in which a new sign-in
can still alert, so an alert 41c1 promised is lost. A mobile teardown waits
five seconds on itself when its own push-disable call is refused, and a late
refused request after a finished teardown tears down again, resetting a login
form the person has started. An accepted invitation whose sign-out fails
shows a form error, and the retry lands on the dead-link card. The app lock
treats iOS's inactive state during its own prompt as leaving the app.

## In scope

- **A failed session report is retried.** Web treats a non-2xx
  `track-session` answer as a failure and retries twice with a short backoff;
  mobile's session presence does the same, and neither marks the token
  reported until a report succeeds.
- **A mobile teardown never waits on itself.** Disabling push during a
  teardown sends without the rejected-token handler, as the sign-out call
  already does.
- **A finished teardown does not repeat.** A refused request that arrives when
  no session remains does nothing.
- **An accepted invitation stays accepted.** When acceptance succeeded and the
  global sign-out then fails, the page signs out locally and still shows
  success.
- **The app lock ignores its own prompt.** Only `background` arms the lock;
  `inactive` (the system prompt, the app switcher, Control Center) raises a
  privacy cover without locking.

## Out of scope

- Drift guards (41d2) and device rehearsals (41d3; the app-lock change is
  proven there on a real device).

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - web session report retries** - _Done when:_ client tests
      prove a 409 then success reports once, a persistent failure stops after
      three attempts, and a failure is not remembered as sent.
- [x] **Step 2 - mobile presence retries** - _Done when:_ provider tests
      prove the same for session presence.
- [x] **Step 3 - mobile teardown** - push-disable without the rejected-token
      handler; no teardown without a session. _Done when:_ tests prove a 401
      on the push call does not stall the teardown and a late 401 after a
      finished teardown does nothing.
- [x] **Step 4 - accepted invitation survives a failed sign-out** - _Done
      when:_ a page test fails the global sign-out after acceptance and still
      sees success and a local sign-out.
- [x] **Step 5 - app lock and inactive** - _Done when:_ a provider test sends
      `inactive` after a passed check and the app stays unlocked, and
      `background` still locks.
- [x] **Step 6 - audit repairs** - F-42 (a privacy cover for the app
      switcher), F-43 (a failed lookup still tears down), F-44 (a retry stops
      when replaced) and F-45 (tests). _Done when:_ each has a test that fails
      without it.

## Files / areas

- `apps/web/src/components/AuthProvider.tsx`,
  `features/account/client/session-registration.ts`.
- `apps/mobile/src/shared/providers/AuthSessionProvider.tsx`,
  `apps/mobile/src/shared/lib/auth-reset.ts`, `shared/lib/api.ts`.
- `apps/web/src/app/(app)/accept-invite/page.tsx`.
- `apps/mobile/src/shared/providers/AppLockProvider.tsx`.

## Data / contracts

- No schema or API change.

## Testing

- Client, provider and page tests per step.

## Notes for the AI

- The new-sign-in claim window is 15 minutes (`security-alerts.ts`); retries
  must land well inside it.
- No em dashes.

## Verification notes

- Full `npm run test` (web 4637/4637) and `npm run build` passed; after the
  last app-lock change `npm run test:mobile` passed 1334/1334.
- The app lock's switcher cover and the `inactive` behavior are proven only
  in tests; the iOS device rehearsal belongs to 41d3. F-42 stays open at the
  repair limit with its next fix written down.

## Findings

### 41d1/F-43 [P3] closed - A failed session lookup was treated as having no session

**File:** `apps/mobile/src/shared/lib/auth-reset.ts:78`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** auth-js reports a failed refresh as `{ session: null, error }` while keeping the session, so a 401 then did nothing and the app stayed signed in with failing requests until the refresh ticker gave up.
**Suggested fix:** Return early only on a clean answer with no session.
**Resolution:** The guard requires no `error`; a test proves a failed lookup still tears down. Re-review (d4a48aa5): closed.

### 41d1/F-44 [P3] closed - A web report retry could speak for a session that replaced it

**File:** `apps/web/src/features/account/client/session-registration.ts:57`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** The report is cookie-authenticated, so a retry after a quick sign-out and sign-in posted with the new session's cookie, alongside its own report.
**Suggested fix:** Stop retrying once the registration state has moved on.
**Resolution:** Each retry checks it is still the current registration; a test counts four sends where the old code made six. Re-review (d4a48aa5): closed.

### 41d1/F-45 [P3] closed - 41d1 test gaps and a redundant sign-out

**File:** `apps/web/src/components/AuthProvider.tsx:38`; `apps/web/src/app/(app)/accept-invite/page.tsx`
**Found:** 2026-09-25 by `/audit` (scope: current, b3848e11..46bda2bb; all lenses)
**Why it matters:** Reverting the non-2xx throw kept every test green, and the accept page signed out locally a second time after the global sign-out, which already does.
**Suggested fix:** Test the throw; drop the second sign-out.
**Resolution:** `sendSessionRegistration` is tested for a 409 and a 200; the page only swallows the global sign-out's error. The mobile provider test still replays a token after a 401, which does not happen in production; the helper's own tests cover realistic failures. Re-review (d4a48aa5): closed.
