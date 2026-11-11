# Mobile identity checks use Face ID or a fingerprint first

**Type:** Fix
**Status:** verified

### The problem

When the server asks for fresh proof (`403 STEP_UP_REQUIRED`) before a sensitive action on mobile, `useMobileStepUpAction` always opens the typed sheet. That covers Security sessions, the password retry, two-factor setup and Work details. The owner wants people who turned on biometric unlock (App lock) to confirm with Face ID or a fingerprint, and to type their password only as a fallback.

A biometric check alone proves nothing to the server. Fresh proof is a `password` (or `totp`) entry in the token's `amr` from the last 5 minutes, written only by Supabase Auth. The server keeps that rule unchanged.

### The fix

Option A, chosen by the owner on 2026-11-11: keep the password on the phone behind biometrics.

- After a typed password step-up succeeds, and only while App lock is on, the app saves the password in SecureStore with `requireAuthentication`:
  - iOS stores it under `.biometryCurrentSet`, with no passcode fallback;
  - Android uses a `BIOMETRIC_STRONG` Keystore key, so saving asks for the fingerprint once;
  - the item is `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`;
  - it is keyed to the user id through a separate, unprotected owner entry.
- At the next password step-up, Face ID releases the password. The app makes the same `reauthenticate` call as the typed path, so the server still checks the real password, and then retries the action.
- It falls back to the typed sheet, as today, when:
  - App lock is off;
  - the platform is web;
  - nothing is saved, or the copy is someone else's;
  - the person cancels or fails the biometric prompt;
  - the item was invalidated because a new face or finger was enrolled;
  - the server refuses the saved password (the copy is then deleted);
  - any other failure, which keeps the copy.
- Accounts with two-factor keep typing their code. The TOTP secret is never stored.
- The saved copy is deleted:
  - on every sign-out and forced session teardown (`handleExpiredMobileSession`), which also ends a password change;
  - when App lock is turned off;
  - when the owner entry names another user.
- While the biometric prompt is up, the App lock cover stays down, as it does for the Security screen's own device check.

Must not break:

- the typed sheet;
- the two-factor path;
- the context-key guards that drop an action when the account or organization changes mid-check;
- the rule that an ambiguous mutation is never replayed.

Out of scope: the Change password screen's own Current password field. Supabase requires it in the update, and it isn't the identity prompt.

### Build steps

- [x] 1. `biometric-step-up.ts`: choosing the method (pure), reading, saving and clearing the saved copy, with unit tests for the choice and each fallback. Done when the tests pass.
- [x] 2. `useMobileStepUpAction` tries the saved copy before opening the sheet, and saves after a typed password succeeds. Hook tests cover:
  - biometric success completing the action with no sheet;
  - cancel showing the sheet;
  - a refused saved password deleting the copy and showing the sheet;
  - App lock off showing the sheet;
  - a two-factor account showing the sheet.
    Done when the tests pass.
- [x] 3. Clear on sign-out (`handleExpiredMobileSession`) and when App lock is turned off. Keep the App lock cover down during the prompt. Done when the tests pass.
- [x] 4. Type-check, lint and the mobile tests (1717) pass. Checked on the iOS Simulator (iPhone 17 Pro, iOS 26.5, Face ID enrolled, QA Super Admin) on 2026-11-11:
  - the first step-up showed the sheet, and the typed password saved the copy under `dg_step_up:auth`;
  - the next step-up, more than 5 minutes later, completed with no sheet, through a new session;
  - turning App lock off deleted both entries, and the next step-up showed the sheet again.

  Not verified:
  - The simulator doesn't enforce the keychain item's biometric lock, so no Face ID prompt appeared for the read, and the cancel and nomatch fallbacks could only be covered by unit tests. A physical iPhone is needed to see the prompt.
  - Android, because the emulator's app is a release build and the local `android/` project is stale for SDK 57, so a debug build fails.

### Verify

Turn on App lock in Profile > Security. Open Sessions and sign out another session:

1. The first time, type the password.
2. The next time, more than 5 minutes later, Face ID appears and the action completes with no sheet.
3. Cancel Face ID, and the password sheet appears.
4. Turn App lock off, and the sheet appears again.
