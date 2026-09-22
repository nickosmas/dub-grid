# MFA is enforced for every access path, not only sensitive actions

**Type:** Fix

**Fixes:** F-07 (archived as `runtime-resilience-webhook-deeplinks-paging-realtime/F-07`)

**Status:** verified

## The problem

An account with a verified TOTP factor can be used without that factor.
Measured against the local stack on 2026-09-22 with a probe that enrolled a
factor on `qa-mfa-chromium@dubgrid.test`:

| Step                              | `aal`                                                 |
| --------------------------------- | ----------------------------------------------------- |
| Password sign-in, factor enrolled | `aal1`                                                |
| After the TOTP challenge          | `aal2`                                                |
| After a token refresh             | `aal2` (survives)                                     |
| A second, password-only sign-in   | `aal1`, and `GET /rest/v1/employees` returned **200** |
| After unenrolling and refreshing  | `aal1`                                                |

The web login route refuses to orchestrate the session until the challenge
completes (`api/auth/login/route.ts:419`), but that is a UI gate: a caller
who takes an `aal1` token straight from Supabase's auth endpoint (the anon
key is public) reaches the data API and every web Route Handler, because
`requireAuthenticatedSession` verifies the JWT without looking at `aal`,
and `caller_org_id()` (`016:32`) reads only the org claims. Mobile is the
exception: `packages/mobile-api-core/src/auth.ts:405` refuses `aal1` for an
enrolled user against live factor state.

The refresh row above is the one that matters for the repair: an `aal2`
session stays `aal2` across refresh, so enforcing on the claim cannot log
out a session that answered its challenge.

## The fix

Enrollment becomes a claim, so every layer can decide locally with no extra
round trip and no dependence on `profiles.mfa_enabled` (which the client
writes and can leave stale).

- **Migration `037_mfa_enrolled_claim.sql`.** Restate
  `custom_access_token_hook` from 021 with one hunk: a `mfa_enrolled`
  boolean claim, `EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = uid
AND factor_type = 'totp' AND status = 'verified')`, set on both branches.
  The hook is `SECURITY DEFINER` owned by `postgres`, which reads the auth
  schema, and it runs on every mint and refresh, so enrolling or unenrolling
  self-heals on the next token. A text-equivalence test pins the
  restatement to that single hunk.
- **Shared decision.** `packages/authz/src/assurance.ts` gains
  `requiresMfaChallenge(claims)`: true when `mfa_enrolled` is true and `aal`
  is not `aal2`. Unit tests cover a missing claim (false, so a pre-migration
  token is not locked out), `aal2`, and the enrolled `aal1` case.
- **Web boundary.** `requireAuthenticatedSession` and
  `requireAuthenticatedUserWithClaims` in `apps/web/src/lib/api-auth.ts`
  refuse with the existing `STEP_UP_REQUIRED` envelope (403) when
  `requiresMfaChallenge` holds, so every Route Handler inherits it, and the
  proxy (`apps/web/src/proxy.ts`) redirects such a session to the login
  screen's challenge instead of rendering the app.
- **Policy layer, migration `038_mfa_enforced_in_policies.sql`.**
  `caller_org_id()` and `is_gridmaster()` return NULL/false for an enrolled
  caller below `aal2`, which closes the data API and Realtime for that
  session. This goes beyond the session boundary the earlier decision
  named, on the strength of the refresh measurement above; it is a separate
  migration so it can be reverted on its own.
- Mobile keeps its live-factor check, which is stricter than the claim and
  independent of it.

Must not break: a session with no factor (claim false or absent), an
`aal2` session across refresh, the MFA enrollment and unenrollment flows
themselves (Auth API, no RLS), the mobile login, the gridmaster portal for
an `aal2` gridmaster, the seed, and every existing test.

## Build steps

- [x] **1. The claim (migration 037)** - the restated hook, checksum, doc
      range, text-equivalence test. Done when `db:migrations:check` and a
      clean reset pass, the equivalence test shows exactly one hunk against
      021, and a live probe shows `mfa_enrolled` true for an enrolled
      account and false after unenrolling.
- [x] **2. Shared decision and the web boundary** - `requiresMfaChallenge`
      with tests, the two `api-auth` entry points, the proxy redirect, route
      tests. Done when an `aal1` enrolled token is refused by a Route
      Handler and by the proxy, an `aal2` token is accepted, and a token
      without the claim is accepted.
- [x] **3. Policy layer (migration 038)** - `caller_org_id()` and
      `is_gridmaster()` restated with the assurance guard, checksum, text
      test, live test. Done when a live test shows an enrolled `aal1` token
      reading nothing through the data API, the same account reading
      normally at `aal2`, and an unenrolled member unaffected.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, the live integration tests, a clean
  `supabase db reset`.
- Probe against the local stack: enroll a factor on a QA account, take an
  `aal1` token, and confirm the data API, a web Route Handler and the proxy
  all refuse it; complete the challenge and confirm all three accept;
  refresh and confirm they still accept; unenroll, refresh, and confirm a
  password-only session works again.
- `/audit` afterwards.
