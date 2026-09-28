# Fix: A signed-in password change always runs on a brand-new session

**Type:** Fix
**Status:** verified
**Fixes:** F-62

## The problem

Supabase's `secure_password_change` refuses a password update without a
reauthentication nonce once the session is more than 24 hours old. DubGrid's
authenticator-code step-up upgrades the old session instead of making a new one,
and mobile sessions last until sign-out. With the setting on, a two-factor user
could not change their password on mobile after their first day. Production had
it off. That left a gap: a stolen token of any age could change the password
through the Auth API directly, because DubGrid's own check before a change runs
in the app, not in Auth.

## The fix

The owner asked for the best option on 2026-09-28. Chosen: make every change
safe under the setting, then turn it on.

- `reauthenticate` (MFA lifecycle route, web and mobile) takes an optional
  six-digit `code`.
  - A two-factor account signs in with its password on a new session, and the
    server answers that session's challenge with the code before the
    organization switch and refresh.
  - Without a code, a two-factor account is still refused, as before.
  - The audit event records the method as `totp`.
- Web Security settings and mobile Profile > Password ask for the current
  password, and a two-factor account's authenticator code.
  - A first-time change always signs in again this way before
    `updateUser({ password })`, so it runs on a brand-new session.
  - If the server says the account has two-factor, the code field appears.
  - A mobile retry that only finishes the sign-out keeps the existing step-up.
- Recovery and reset flows already run on new recovery sessions and are
  unchanged.
- `internal/authentication.md` gains §3.3.

## Build steps

- [x] **1. Server re-sign-in with a code.**
  - _Done when:_ route tests show a right code, a wrong code (original session
    kept, nothing leaked) and a missing code.
- [x] **2. Web and mobile change forms.**
  - _Done when:_ component tests show the re-sign-in before the change, with the
    code for two-factor, the code field on the server's request, and nothing
    changed on a refused password.
  - Reverting any changed file fails its tests.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test`
- **Production:** once this code is released, turn `secure_password_change` on
  (Supabase Dashboard > Authentication > Providers > Email, "Secure password
  change").
