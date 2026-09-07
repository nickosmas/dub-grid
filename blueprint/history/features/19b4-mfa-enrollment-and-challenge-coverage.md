# Feature: MFA enrollment and challenge coverage

**From build-plan:** feature 19b4
**Status:** verified

## Goal

Prove and repair the TOTP lifecycle across the web and mobile apps: enrollment,
verification, cancellation or unenrollment, and the required-MFA challenge. A
verified factor must require an AAL2 session without leaving stale enrollment
factors or allowing an AAL1 session to enter the app.

## In scope

- Web TOTP enrollment and cancellation cleanup, including failed verification
  and the persisted MFA-enabled status.
- Mobile TOTP enrollment, verification with its promoted AAL2 token,
  cancellation or screen-leave cleanup, and disable behavior.
- Mobile required-MFA login challenge and server-side AAL1 rejection after a
  verified TOTP factor exists.
- Focused regression coverage for the above contracts.

## Out of scope

- Invitation, password recovery, sign-in session restoration, and revocation,
  which are covered by 19b1 through 19b3.
- Role-based setup, onboarding, billing, and trial gates, which are 19b5.
- Broad MFA security or rate-limit policy changes, which are 19d.
- New MFA factors, recovery codes, or a change to the existing role model.

## Build loop

Build one step at a time. Each step gets a focused test and diff review before
the next step. The user requested one consolidated pass, so the steps stay
small but are presented together once their verification is complete.

## Build steps

- [x] **Step 1 - protect the web enrollment lifecycle** - ensure a browser
      TOTP factor started by the profile screen is unenrolled when the component
      leaves before verification, while retaining the existing explicit cancel and
      verified-factor behavior. _Done when:_ unmounting after enrollment calls the
      factor unenrollment client exactly once, and the focused web MFA tests pass.
- [x] **Step 2 - harden the mobile enrollment and challenge handoff** - cover
      stale-factor cleanup, failed verification, and the promoted AAL2 token that
      persists mobile MFA status; keep the pending session out of storage until the
      challenge succeeds. _Done when:_ the mobile profile and login tests prove
      cleanup/error behavior and no pending AAL1 session is stored.
- [x] **Step 3 - prove required-MFA enforcement at the mobile API boundary** -
      cover the MFA-required login payload and reject AAL1 requests for every
      verified-TOTP account while allowing the promoted AAL2 session. _Done when:_
      the server tests distinguish no factor, verified factor plus AAL1, and
      verified factor plus AAL2 without changing tenant or role authorization.

## Files / areas

- `apps/web/src/components/profile/MFASetup.tsx`
- `apps/web/src/__tests__/MFASetup.test.tsx`
- `apps/mobile/src/features/profile/screens/ProfileTwoFactorScreen.test.tsx`
- `apps/mobile/src/features/auth/screens/LoginScreen.test.tsx`
- `apps/web/src/features/mobile/server/auth.test.ts`
- `apps/web/src/features/mobile/server/routes/auth-login.test.ts`

## Data / contracts

- Only a verified TOTP factor makes MFA enabled and requires the login
  challenge.
- A verified factor upgrades the active session to AAL2; the mobile API must
  reject an AAL1 access token after that factor exists.
- `updateMfaStatus` and `updateProfileMfaStatus` are invoked only with the
  successful, authenticated session token appropriate to their client.
- Pending factors are removed on cancellation or screen unmount. Do not log or
  persist the TOTP secret, verification code, or session tokens.
- MFA enforcement is account based, not role based. Roles retain their current
  authorization behavior after the AAL boundary is satisfied.

## Testing

- Focused web and mobile MFA tests passed.
- `npm run test:web` passed.
- `npm run test:mobile` passed.
- `npm run type-check` passed.
- `npm run build` passed.
- Manual path: enable 2FA in web and mobile profile, cancel an in-progress
  setup, complete a fresh setup, sign in with a six-digit challenge, then
  disable 2FA and confirm password-only sign-in works again.

## Notes for the AI

- Keep web client behavior in the existing account client helpers and mobile
  behavior in the existing Supabase/mobile API paths. Do not introduce a shared
  UI component.
- Preserve the friendly names already used by each app and their current
  user-facing error messages.
- Treat Supabase `{ error }` results as failures explicitly. Use the promoted
  token returned by `challengeAndVerify` for the mobile status update.
- The build is intentionally scoped to MFA lifecycle correctness. Do not fold
  in 19c performance work or 19d policy changes.
