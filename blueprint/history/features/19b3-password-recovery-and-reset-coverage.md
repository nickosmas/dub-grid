# Feature: Password recovery and reset coverage

**From build-plan:** feature 19b3
**Status:** verified

## Goal

Prove that a person can safely request, verify, and complete a password reset
on web and mobile, while expired, invalid, replayed, rate-limited, and
transport-failed recovery paths remain recoverable without exposing account
existence, retaining a recovery session, or dropping the person into a stale
authenticated context.

## In scope

- Cover the web recovery-request page's anti-enumeration success path and its
  actionable rate-limit and network failures.
- Cover the web recovery-link routes and reset page through valid handoff,
  invalid or expired links, malformed or external redirects, a completed reset,
  and replay-safe URL cleanup.
- Cover the mobile in-app OTP request, verification, resend, and password-save
  lifecycle through accepted, expired, rejected, rate-limited, and replayed
  states.
- Confirm that both platforms use the shared password rules and the intended
  post-reset session-revocation scope; repair only confirmed correctness or
  recovery defects.

## Out of scope

- Invitation, ordinary sign-in, session restoration, and device revocation
  coverage, completed in 19b1 and 19b2.
- MFA enrollment or challenge behavior, onboarding admission, trial/setup
  gates, and broader auth performance or security work, which belong to 19b4,
  19b5, 19c, and 19d.
- Email template redesign, delivery-provider configuration, or changes to
  Supabase's remote recovery template.
- A policy change to session-revocation scope without evidence that the current
  platform-specific behavior is incorrect.

## Build steps

- [x] **Step 1 - Lock the web recovery request contract** - audit and extend
      tests around the forgot-password page and browser auth helper. _Done
      when:_ a syntactically valid request always reaches the same neutral
      completion state whether or not an account exists, only rate-limit and
      transport failures surface actionable feedback, and the redirect target
      remains the current origin's reset route.
- [x] **Step 2 - Lock web recovery-link and reset completion contracts** - add
      route and client-page coverage for server OTP confirmation, PKCE exchange,
      invalid/expired links, safe relative `next` handling, URL cleanup, and
      successful password update/sign-out. _Done when:_ only a verified recovery
      session reaches the form, invalid or replayed links expose the recovery
      state rather than an authenticated app, and a successful reset finishes
      on the signed-out sign-in path.
- [x] **Step 3 - Close mobile OTP recovery and replay gaps** - extend the
      existing native screen tests for request, verification, resend, and save
      failures, including stale/replayed codes and any confirmed recovery-state
      bug. _Done when:_ every auth call uses the ephemeral client, a failed code
      or resend stays recoverable, password save follows the established global
      revocation contract, and the app cannot enter tabs before recovery ends.
- [x] **Step 4 - Verify the recovery slice** - run focused web and mobile
      suites, then run `npm run test:web`, `npm run test:mobile`,
      `npm run type-check`, and `npm run build`. _Done when:_ all affected routes
      and screens pass without logging secrets, weakening CSRF/RLS, or leaking
      account-existence information.

## Files / areas

- `apps/web/src/app/(app)/forgot-password/`, `reset-password/`, and
  `auth/{confirm,callback,verify}` routes/pages.
- Browser auth helpers under `apps/web/src/features/account/client/` and their
  focused tests.
- `apps/mobile/src/features/auth/screens/{ForgotPasswordScreen,ResetPasswordScreen}`
  plus `recovery-errors.ts`, auth routes, and focused native tests.
- `packages/domain/src/password.ts` only if a shared-password-rule defect is
  confirmed; no independent app-level rule copies.

## Data / contracts

- Requesting a reset must not reveal whether an email belongs to an account.
- Web recovery redirects must remain same-origin relative paths; untrusted or
  protocol-relative `next` values fall back safely.
- A recovery token/code can establish only the temporary recovery session needed
  to change the password. Invalid, expired, or replayed credentials cannot
  expose an authenticated organization or app surface.
- Mobile recovery always uses `createEphemeralSupabaseClient()` so the temporary
  recovery session never enters SecureStore or `AuthSessionProvider`.
- Password acceptability and mismatch behavior come from `@dubgrid/domain` on
  both platforms. No password, recovery code, token, hash, or session value may
  appear in logs, test labels, telemetry, or user-facing errors.

## Testing

- Use Vitest and Testing Library with mocked Supabase/browser helpers. Use fake
  timers for web recovery timeout and mobile resend cooldown behavior.
- Add a regression test for each confirmed route, state transition, or recovery
  defect. Preserve the existing ephemeral-client guards on mobile.
- Run focused web and mobile suites after each step, then the full commands in
  Step 4. Run a production build because public auth routes and callback
  boundaries are changed or exercised.
- When safe local credentials are available, manually request a reset for Calm
  Haven and follow only a test-account recovery path. Record unavailable email,
  authenticated-browser, or native-device evidence for 19e rather than
  fabricating it.

## Notes for the AI

- Keep request copy neutral. Do not add account-not-found, user-exists, or
  provider-specific token errors.
- Treat Supabase auth results as `{ error }` values as well as possible thrown
  transport failures.
- Keep link verification and session establishment server-safe; do not weaken
  cookie, redirect, CSRF, tenant, or authorization safeguards for tests.
- Reuse existing auth components and user-facing recovery wording where a test
  exposes a defect. This feature validates lifecycle behavior, not auth UI
  redesign.
