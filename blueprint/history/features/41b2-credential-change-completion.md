# Feature: Credential change completion

**From build-plan:** feature 41b2
**Status:** verified

## Goal

A credential change should finish in a known state. Today a two-factor
account cannot reset a forgotten password at all: Supabase refuses the
recovery password update at `aal1` ("AAL2 session is required to update email
or password when MFA is enabled", proven on the local stack). A signed-in
password change reads a lost response as "couldn't update" and skips the
global sign-out, and a mobile retry after a failed sign-out replays the change
it already made. A manager's sign-in email change can alter the sign-in, end
the person's sessions and send notices, then fail on a stale version or a
duplicate contact email and leave the record behind.

## In scope

- **Recovery asks for the authenticator code first.** On web and mobile, a
  recovery session whose account has a verified factor (current `aal1`, next
  `aal2`) shows the second-factor step before the new-password form. The
  verified session is `aal2` on the same session with `amr` `[totp, otp]`, so
  the update succeeds and the recovery sign-out still sees its fresh `otp`
  proof. Backing out signs the recovery session out.
- **A signed-in password change never reads "maybe" as "no".** Web and
  mobile bound the update with a deadline and use
  `mayHavePasswordUpdateCommitted`: a possibly applied change finishes like an
  applied one, signing out everywhere with a message to sign in with the new
  password.
- **A mobile retry after a failed sign-out retries only the sign-out.**
- **A manager's sign-in email change checks first.** Web checks the record
  version, and both platforms check contact conflicts, before the sign-in is
  touched.
- **A password change is audited** through the global sign-out that follows
  it, with its own reason.

## Out of scope

- **Server-side credential mutation (41b research G1).** Password, email and
  factor changes stay direct Supabase calls; DubGrid's preflight enforces the
  five-minute assurance for its own clients only. Moving the mutation behind
  DubGrid routes is an architecture decision, recorded as a finding.
- **Self email change** ending sessions or being audited: the change happens
  when Supabase processes the confirmation link, with no DubGrid hook.
- **Assurance coverage** (41b3) and **alerts** (41c).
- **A lost authenticator during recovery.** The step says to contact support;
  no factor-bypass path is added.

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - pin the recovery assurance facts** - a live test against
      the local Supabase Auth, skipped when it is unreachable: with a
      throwaway user, a recovery session is `aal1` with `amr` `otp`; with a
      verified factor the password update is refused `insufficient_aal`;
      after a TOTP verify on the same session it is `aal2` with `otp` still in
      `amr`, and the update succeeds. The user is deleted afterwards. _Done
      when:_ the test passes locally and skips cleanly without the stack.
- [x] **Step 2 - web recovery second factor** - the reset-password page
      checks the recovery session's assurance and shows `MFAVerify` before the
      form when a factor is required; cancel signs the recovery session out
      and returns to login. _Done when:_ page tests cover a
      factor account (step shown, form only after verify), a plain account
      (form directly), and cancel.
- [x] **Step 3 - mobile recovery second factor** - the reset screen checks
      assurance on its ephemeral client after `verifyOtp`, shows a code step
      when a factor is required, verifies on that client, and uses the
      promoted token for the recovery sign-out. _Done when:_ screen tests
      cover the factor path (code step, then form, then sign-out with the
      promoted token), a plain account, and a wrong code.
- [x] **Step 4 - signed-in password change unclear outcomes** - web and
      mobile bound the update and use `mayHavePasswordUpdateCommitted`; a
      possibly applied change signs out everywhere. _Done when:_ tests on
      both platforms cover a timeout and a lost response (sign-out runs) and a
      definite rejection (form stays).
- [x] **Step 5 - mobile retry finishes the sign-out** - once the password
      has changed, "Update and sign out" retries only the sign-out. _Done
      when:_ a screen test proves a retry after a failed sign-out calls the
      sign-out and not `updateUser`.
- [x] **Step 6 - manager sign-in email pre-checks** - web returns the 409
      conflict when the expected version is stale, and both platforms run
      `checkEmployeeEmailConflict` and return the contact conflict, before
      `syncLinkedLoginEmail`. The conflict copy is shared with the row-update
      path. _Done when:_ route tests on both platforms prove neither case
      touches the sign-in, ends sessions or sends notices.
- [x] **Step 7 - audit a password change** - the global sign-out after a
      password change carries a `password_change` reason on web and mobile
      and records `security.auth.session` / `password_changed`. _Done when:_
      route tests on both platforms and the registry headline cover it.

## Files / areas

- `apps/web/src/__tests__/recovery-assurance.integration.test.ts` (new).
- `apps/web/src/app/(app)/reset-password/page.tsx` and its test.
- `apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx` and its test.
- `apps/web/src/components/account/SecurityPanel.tsx`,
  `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx`.
- `apps/web/src/app/api/employees/manage/route.ts`,
  `apps/web/src/features/mobile/server/routes/person.ts`,
  `apps/web/src/lib/employee-contact-conflicts.ts`.
- `apps/web/src/lib/auth/session-sign-out.ts`, `security-audit.ts`,
  `apps/web/src/lib/audit/registry.ts`, the sign-out routes.

## Data / contracts

- Recovery facts (local GoTrue): `aal1`/`amr otp` after `verifyOtp`;
  `insufficient_aal` on update with a factor; `aal2`/`amr [totp, otp]` on the
  same session after `challengeAndVerify`.
- `SecurityEventReason` gains `password_changed`; the sign-out body gains a
  `password_change` reason beside `password_recovery`.

## Testing

- The live test needs the local stack's Auth and database; it skips without
  them, like the other `*.integration.test.ts`.
- Page, screen and route tests per step.

## Notes for the AI

- Never touch the QA accounts in live tests; create and delete a throwaway
  user.
- `MFAVerify` is the component the login and accept pages already use.
- Mobile recovery must stay on the ephemeral client, never the persistent one.
- No em dashes.

## Findings

### 41b2/F-01 [P2] closed - Web recovery's Try again after a failed assurance check can never succeed

**File:** `apps/web/src/app/(app)/reset-password/page.tsx:78`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** When `getBrowserAssuranceLevel` throws the page shows Check your connection, but the one-time code or the recovery capability is already spent, so Try again re-enters the link path, finds neither, and says the link is invalid while a valid recovery session sits in the browser.
**Suggested fix:** Once the session is established, retry only the assurance check; add a test that clicks Try again.
**Resolution:** Fixed in the 41b2 repair checkpoint. The page remembers once its recovery session exists, and Try again then repeats only the assurance check. A test clicks Try again after a failed check and reaches the form. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-02 [P2] closed - A mobile retry can sign out without applying a newly typed password

**File:** `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx:215`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** `passwordChangeRef` is never cleared and the fields stay editable. After a network failure of the sign-out the dialog closes with a generic toast, so a user who types a different password and retries is signed out everywhere believing the new text is their password.
**Suggested fix:** Once the password has changed, show a finish-signing-out state that says so, with the fields locked; keep the changed-password copy inline for a network failure too.
**Resolution:** Fixed in the 41b2 repair checkpoint. Once the password has changed the fields lock, the action becomes Finish signing out ("Finish signing out?", "Sign out everywhere"), and a failed sign-out always keeps the dialog open with "Your password changed", network failures included. The test fails the sign-out with a network error and finishes it. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-03 [P3] closed - A mobile recovery failure after the emailed code strands the user

**File:** `apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx:95`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** If the assurance or factor lookup fails after `verifyOtp` succeeded, the screen stays on the email-code stage with a spent code, and the no-authenticator message shows under Enter your code with the recovery session left open.
**Suggested fix:** Once verified, retry only the lookup; give the no-authenticator case its own sign-out exit.
**Resolution:** Fixed in the 41b2 repair checkpoint. A retry after a verified code repeats only the assurance and factor lookup, and an account with no authenticator gets its own stage whose only exit signs the recovery session out; the code stage's Back to sign in signs out too. Tests cover both. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-04 [P3] closed - The goodbye password notices show before, and regardless of, the sign-out

**File:** `apps/web/src/app/(app)/goodbye/RunLogoutTeardown.tsx:75`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** The "signed you out everywhere" toast appears before the sign-out runs and even when it fails, and any link can raise it with a local scope.
**Suggested fix:** Show a password reason's notice only for a global scope, after the sign-out succeeded.
**Resolution:** Fixed in the 41b2 repair checkpoint. A password reason's notice shows only after the global sign-out it announces succeeds, never for a local scope; the inactivity notice is unchanged. Tests cover a failed sign-out and a local scope. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-06 [P3] closed - The email conflict pre-check treats underscore and percent as wildcards

**File:** `apps/web/src/features/employees/server/contact-conflicts.ts:58`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** `ilike` matches `john_doe@x.com` against `john.doe@x.com`, which the unique index would accept, so 41b2's new server-side pre-check can refuse a valid manager email change.
**Suggested fix:** Escape `_`, `%` and backslash in the pattern.
**Resolution:** Fixed in the 41b2 repair checkpoint. The pre-check escapes backslash, `%` and `_` before `ilike`; a new unit test pins the literal pattern. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-07 [P3] closed - Test gaps in the 41b2 diff

**File:** `apps/web/src/app/(app)/reset-password/page.test.tsx`; `SecurityPanel.test.tsx`; `ProfilePasswordScreen.test.tsx`
**Found:** 2026-09-25 by `/audit` (scope: current, 3c8b690c..3b6d908b; all lenses)
**Why it matters:** No web test verifies the code and then submits; neither signed-in password screen tests a deadline (`RequestTimeoutError`), which the spec asked for.
**Suggested fix:** Add the MFA-then-submit web case and a timeout case on both platforms.
**Resolution:** Fixed in the 41b2 repair checkpoint. Added the web MFA-then-submit recovery case and a deadline (`RequestTimeoutError`) case for the signed-in password change on both platforms. **Closed:** Audit 2026-09-25, second pass (scope: current, 3b6d908b..22528380): the defect is gone; its new interactions are recorded as F-09 to F-11.

### 41b2/F-09 [P3] closed - After a password change, mobile's leave-screen warning says the password was not saved

**File:** `apps/mobile/src/features/profile/screens/ProfilePasswordScreen.tsx:169`
**Found:** 2026-09-25 by `/audit` (scope: current, 3b6d908b..22528380; all lenses)
**Why it matters:** Once the password has changed, backing out still warns that the password being entered won't be saved, which is false, and leaving strands the unfinished sign-out.
**Suggested fix:** When the password has changed, say so in the warning and that other sessions are still signed in.
**Resolution:** Fixed in the 41b2 second repair checkpoint. After the change the leave-screen warning reads "Leave without signing out?" and says the password already changed with other sessions still signed in. A test backs out after a failed sign-out. **Closed:** Audit 2026-09-25, third pass (scope: current, 22528380..a53695e3): the defect is gone and the repair introduced none.

### 41b2/F-10 [P3] closed - A failed sign-out everywhere after a password change drops the password advice

**File:** `apps/web/src/app/(app)/goodbye/RunLogoutTeardown.tsx:120`
**Found:** 2026-09-25 by `/audit` (scope: current, 3b6d908b..22528380; all lenses)
**Why it matters:** The only message left is the generic sign-out failure, so an unconfirmed change loses the advice to try the new password, then the previous one.
**Suggested fix:** A failure variant of the password notice.
**Resolution:** Fixed in the 41b2 second repair checkpoint. A failed sign-out everywhere after a password change keeps the password advice, in separate wording for a completed and an unconfirmed change. The teardown test asserts it. **Closed:** Audit 2026-09-25, third pass (scope: current, 22528380..a53695e3): the defect is gone and the repair introduced none.

### 41b2/F-11 [P3] closed - Mobile recovery's Back to sign in may wait on the recovery sign-out

**File:** `apps/mobile/src/features/auth/screens/ResetPasswordScreen.tsx`
**Found:** 2026-09-25 by `/audit` (scope: current, 3b6d908b..22528380; all lenses)
**Why it matters:** `leaveRecovery` awaits the ephemeral client's sign-out before navigating, so after a timed-out verification the button can wait up to the auth deadline. Unverified.
**Suggested fix:** Navigate without waiting on the ephemeral client's sign-out.
**Resolution:** Fixed in the 41b2 second repair checkpoint. `leaveRecovery` no longer awaits the ephemeral client's sign-out before navigating. A test with a never-settling sign-out still leaves. **Closed:** Audit 2026-09-25, third pass (scope: current, 22528380..a53695e3): the defect is gone and the repair introduced none.
