# Feature: Sign-in and session lifecycle coverage

**From build-plan:** feature 19b2
**Status:** verified

## Goal

Prove that web and mobile users can sign in, restore a valid session, recover
from an expired or revoked session, and deliberately sign out without a stale
organization context, blank state, or silent loss of session state.

## In scope

- Audit and extend web login route and client coverage for successful sign-in,
  invalid credentials, transient authentication failures, stale refresh tokens,
  and organization-aware session handoff.
- Audit and extend mobile session provider, login, and tab-gate coverage for
  restored sessions, restore timeouts, expired or revoked credentials, and
  clean return to authenticated or recovery UI.
- Cover web and mobile explicit sign-out plus session-specific and force
  revocation outcomes, including user-visible recovery and cache cleanup.
- Repair only confirmed correctness or recovery defects found by those tests.

## Out of scope

- Invitation acceptance and organization selection, completed in 19b1.
- Password recovery and reset, MFA enrollment/challenge, and onboarding,
  setup, or trial decisions. These belong to 19b3, 19b4, and 19b5.
- Authentication performance measurement or broad security hardening, which
  belong to 19c and 19d.
- New authentication capabilities, storage formats, or authorization policy.

## Build steps

- [x] **Step 1 - Lock web sign-in and restoration contracts** - audit the web
      login route, browser auth helpers, and route/client tests; add missing
      regression coverage for valid credentials, bad credentials, transient
      failures, stale refresh tokens, and organization-aware handoff. _Done
      when:_ a valid session reaches the intended organization context, failed
      requests retain a usable sign-in state, and a stale refresh token becomes
      a recoverable anonymous state rather than a broken authenticated one.
- [x] **Step 2 - Lock revocation and sign-out outcomes** - cover explicit
      sign-out, current/other-session revocation, and force logout at the web
      boundary; repair any confirmed stale-cache, notification, or recovery
      gap. _Done when:_ the revoked session cannot continue acting, current
      session termination lands on the correct signed-out path, and unrelated
      sessions retain their valid context.
- [x] **Step 3 - Prove mobile restoration and expiry parity** - cover the
      mobile session provider, login handoff, and tab gate through restored,
      timed-out, expired, and revoked states. _Done when:_ valid restored
      sessions enter tabs exactly once, restore failures give an actionable
      recovery state, and expired or revoked credentials never reveal stale
      authenticated UI.
- [x] **Step 4 - Verify the session lifecycle slice** - run focused tests plus
      the applicable web/mobile suites, type-check, and production build. _Done
      when:_ all added and affected paths pass without changing server-side
      tenant scoping or token secrecy guarantees.

## Files / areas

- `apps/web/src/app/api/auth/login/`, `apps/web/src/lib/api-auth*`, and browser
  authentication/session helpers and tests.
- `apps/web/src/app/api/account/sessions/`, Gridmaster force-logout route, and
  web logout/session UI coverage.
- `apps/mobile/src/shared/providers/AuthSessionProvider*`, auth login and
  recovery screens, tab gates, session helpers, and tests.
- Shared account/session API clients and notification event handling only where
  a confirmed lifecycle defect requires a change.

## Data / contracts

- A session is authenticated only while its access and refresh credentials are
  accepted by Supabase and its current organization claims remain valid.
- Stale, revoked, or unrefreshable sessions must become an anonymous/recovery
  state. They may not reuse bootstrap or organization data from the old token.
- Session-specific revocation targets exactly the selected refresh-token hash;
  global/force revocation may terminate all target sessions but never another
  user's sessions.
- A client-provided organization slug selects a sign-in target only. Effective
  organization access after sign-in remains server-derived from the session.

## Testing

- Add focused regression tests for every newly confirmed branch; use fake timers
  for restore/expiry timeouts and mocks for Supabase session calls.
- Run focused web and mobile suites during each step; finish with `npm run
test:web`, `npm run test:mobile`, `npm run type-check`, and `npm run build`.
- If safe local credentials are available, manually check a Calm Haven sign-in,
  sign-out, and an expired/revoked-session recovery path. Record any unavailable
  browser or native-device evidence for 19e rather than fabricating it.

## Notes for the AI

- Never log access tokens, refresh tokens, session hashes, passwords, or MFA
  challenges in source, tests, telemetry, or user-facing errors.
- Preserve CSRF checks and authenticated actor/target authorization on every
  mutation. Do not weaken RLS or effective-organization scope for test setup.
- Keep web and mobile behavior aligned on recovery meaning, while retaining each
  platform's established navigation and UI primitives.
