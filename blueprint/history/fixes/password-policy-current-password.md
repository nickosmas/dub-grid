# Fix: Password changes send the current password, and the app follows the stricter rule

**Type:** Fix
**Status:** verified
**Branch:** `fix/password-policy-current-password`

## The problem

On 2026-11-05 the owner tightened three production Auth settings: Secure password
change, Require current password when updating, and the password requirement,
now lowercase, uppercase, digits and symbols.

- **Signed-in password changes failed.** Auth v2.197.0 answers
  `current_password_required` to `updateUser({ password })` on any session that
  isn't a recovery session, and web Security settings and mobile Profile > Password
  sent no current password. Forgot-password resets are exempt.
- **The app accepted passwords production refuses.** `isPasswordAcceptable` asked
  for a letter, a number, and an uppercase letter or a symbol, so `abcdefghij1!`
  read as Fair and Supabase then refused it, including at invitation sign-up. It
  also counted a space, an accented letter or an emoji as a symbol, which Supabase
  does not.

## The fix

- **Current password.** Web and mobile send `current_password` on a signed-in
  change. Recovery resets send none.
- **One rule.** Lowercase, uppercase, number and symbol are each required, with
  Supabase's symbols (ASCII punctuation). Accounts with older passwords still sign
  in; the rule applies only when a password is set.
- **Meter.** Fair is gone, since a password the forms accept is always Strong and
  one they refuse is never above Weak. The web meter has three bars.
- **Copy and config.** The form copy, public docs and `supabase/config.toml` follow.
  `password-policy.test.ts` checks the app's rule against Supabase's character sets.

## Verify

- Password rule, password policy, Security settings, reset, invitation and mobile
  password screen tests pass.
- Not run against a live Auth server with the current-password setting on: it is
  dashboard-only, so the behavior comes from Auth v2.197.0's source and the tests
  pin the request.
- Installed mobile builds keep failing a signed-in change while the setting is on,
  until they are rebuilt.
