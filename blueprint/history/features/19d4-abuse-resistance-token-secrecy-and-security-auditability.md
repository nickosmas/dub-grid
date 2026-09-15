# Feature: Abuse resistance, token secrecy, and security auditability

**From build-plan:** feature 19d4
**Status:** verified

## Goal

Close the remaining authentication abuse and observability gaps without
weakening DubGrid's tenant, session, MFA, invitation, recovery, or performance
boundaries. Public identity-facing operations must resist enumeration, abusive
request bursts must be bounded by both source and target where appropriate,
credentials must not leak through URLs or telemetry after application capture,
and important security outcomes must produce useful audit evidence without
recording secrets.

## In scope

- Inventory public and authenticated authentication entry points, their external
  response contracts, rate-limit dimensions, credential transports, telemetry
  sinks, and security-event coverage across web and mobile-backed APIs.
- Normalize public identity-facing failure responses where a caller must not
  learn whether an email, account, invitation, membership, factor, or
  organization state exists.
- Require production-ready distributed rate limiting for sensitive public
  operations, with source and normalized-target limits where repeated attacks
  against one identity must be bounded across changing IP addresses.
- Keep rate-limit keys non-secret and non-identifying through one-way
  derivation, with explicit route-purpose namespaces and stable normalization.
- Remove invitation and recovery credentials from browser-visible URLs as soon
  as the application has safely captured them, and prevent raw credentials from
  reaching logs, Sentry context, audit metadata, or user-facing errors.
- Define a canonical, secret-free security-event contract and cover important
  success, rejection, throttling, recovery, MFA, invitation, session, and
  impersonation outcomes through the existing audit infrastructure.
- Add structural, unit, route, integration, and browser evidence that prevents
  new public Auth operations, secret-bearing telemetry, or unaudited sensitive
  transitions from bypassing classification.

## Out of scope

- CAPTCHA, bot scoring, IP reputation services, device fingerprinting, account
  lockout, passwordless login, passkeys, backup codes, or new Auth providers.
- Replacing Upstash, Supabase Auth, Sentry, or the existing audit tables.
- Product analytics redesign, general application logging cleanup, or
  redaction of ordinary non-secret business data.
- Repeating the tenant/session, MFA assurance, invitation atomicity, recovery
  single-use, redirect, or CSRF work completed in features 19d1 through 19d3.
- Production environment changes, production data access, deployment, remote
  rate-limit mutation, or applying migrations outside local development.
- The final role, state, browser, hosted-provider, and physical-device matrix in
  feature 19e.

## Build loop

Continuous Mode implements these steps in order, self-reviews each diff, runs
focused evidence, and creates the feature-level local `dev` commit only after
all gates pass.

## Build steps

- [x] **Step 1 - Lock the abuse and audit inventory** - classify every public
      identity-facing operation, sensitive credential transport, rate-limit
      dimension, telemetry sink, and required security event. _Done when:_ a
      structural test fails for a newly unclassified public Auth operation or
      raw credential sink, and every current exception has a documented reason.
- [x] **Step 2 - Normalize enumeration-resistant public responses** - make
      forgot-password, invitation registration and lookup, organization
      discovery, login rejection, and adjacent mobile flows reveal no forbidden
      identity state while preserving actionable network and throttling
      recovery. _Done when:_ equivalent unknown and known identities receive
      the same status, shape, and user-facing message for protected operations,
      and no downstream mutation runs after a rejected capability.
- [x] **Step 3 - Enforce layered distributed rate limits** - apply explicit
      source, normalized-target, and global surge limits to sensitive public
      operations, fail closed when production rate limiting is unavailable, and
      keep local development deterministic. _Done when:_ one source cannot fan
      out across targets, one target cannot be attacked across sources, surge
      protection runs before expensive Auth work, route-purpose namespaces do
      not collide, and limiter failure cannot silently disable production
      protection.
- [x] **Step 4 - Remove credentials from URLs and telemetry** - capture valid
      invitation and recovery credentials once, immediately scrub browser
      history, centralize secret redaction, and ensure errors, Sentry payloads,
      server logs, and audit metadata never include raw credentials. _Done
      when:_ navigation and replay behavior remain correct, copied post-capture
      URLs contain no credential, malicious provider errors are redacted, and
      structural tests reject known secret field names or raw query forwarding
      in telemetry calls.
- [x] **Step 5 - Define the security-event contract** - add one typed event
      taxonomy with bounded outcomes and secret-free metadata, route events
      through the existing organization or platform audit boundary, and define
      behavior when no organization can be resolved. _Done when:_ event names
      and metadata are mechanically constrained, actor and tenant scope cannot
      be supplied by an untrusted client, audit failure does not expose secrets,
      and no new parallel audit store is introduced.
- [x] **Step 6 - Cover sensitive outcomes with audit evidence** - emit the
      canonical events for login throttling and rejection, recovery requests and
      completion, invitation acceptance and rejection, MFA lifecycle changes,
      session revocation, and impersonation start or stop where the server has
      trustworthy context. _Done when:_ success and policy-relevant rejection
      paths are covered without duplicate events, public unknown-identity paths
      remain indistinguishable, and tests prove audit payloads contain no raw
      email, password, invitation, recovery, access, refresh, or factor secret.
- [x] **Step 7 - Exercise adversarial and runtime behavior** - run focused
      route and integration tests, then exercise Calm Haven public Auth flows in
      the browser with malformed credentials, repeated submission, history
      inspection, and safe recovery states. _Done when:_ UI copy stays generic,
      credentials disappear after capture, throttling remains recoverable,
      browser console and network behavior reveal no secret, and unavailable
      hosted-provider evidence is recorded for feature 19e.
- [x] **Step 8 - Qualify the complete security pass** - run the full repository
      test suite, type-check, lint, formatting, generated email checks, and
      production build. _Done when:_ every automated gate passes, no P0 or P1
      finding remains open or fixed, the build-plan parent items are checked
      when their final child completes, and the evidence names any remaining
      feature 19e boundary rather than inferring it.

## Files / areas

- `apps/web/src/lib/rate-limit.ts` and adjacent tests
- Public Auth and discovery routes under `apps/web/src/app/api/auth/`,
  `apps/web/src/app/api/invitations/`, and `apps/web/src/app/api/validate-domain/`
- Mobile-backed public Auth handlers under
  `apps/web/src/features/mobile/server/routes/`
- Invitation, forgot-password, recovery, login, and MFA client surfaces
- `apps/web/src/lib/sentry.ts`, server logging helpers, and structural tests
- Existing audit helpers, audit tables, and forward-only local migrations only
  if a confirmed contract gap cannot be closed in application code
- `apps/web/src/__tests__/` security inventories and focused route tests

## Data / contracts

- Public identity-protected operations return a stable external contract that
  does not distinguish known, unknown, inactive, suspended, invited, or already
  completed identity state unless disclosure is required for a user who has
  already proven that identity.
- Rate-limit keys use a route-purpose namespace plus a normalized, one-way
  identifier. Raw email addresses, phone numbers, invitation tokens, recovery
  credentials, passwords, and bearer tokens are never keys or metadata.
- Production-sensitive operations fail closed if their required distributed
  limiter is missing, unreachable, or times out. Local development may use the
  documented deterministic bypass or test double.
- Security events use a closed event-name union, bounded outcome and reason
  values, server-derived actor and organization scope, and allowlisted metadata.
  They contain no authentication credential or raw identity target.
- Browser credentials are captured into memory only for the minimum required
  operation and then removed from the address bar with `history.replaceState`.
  Reloading the scrubbed URL must not re-consume the credential.
- Existing audit storage and retention remain authoritative. This feature adds
  no second audit ledger and does not make public request success depend on a
  best-effort observability write.

## Testing

- Structural tests inventory public identity operations, limiter dimensions,
  secret-bearing query consumers, telemetry sinks, and required event coverage.
- Table-driven tests compare known and unknown identity outcomes by status,
  response keys, headers, and user-facing copy.
- Rate-limit tests cover source fan-out, target distribution, global surge,
  normalization, namespace isolation, missing production configuration,
  timeout, and local behavior.
- Redaction tests use malicious errors and metadata containing invitation,
  recovery, password, authorization, cookie, and Supabase token values.
- Audit tests prove server-derived scope, bounded event names, allowlisted
  metadata, one event per outcome, and non-blocking safe failure.
- Browser checks use Calm Haven and non-production credentials only.
- Final gates: `npm run test`, `npm run type-check`, `npm run lint`,
  `npm run format:check`, `npm run email:build`, and `npm run build`.

## Notes for the AI

- Preserve the generic invitation and recovery capability contracts from 19d3.
- Do not log or display test credentials in progress updates or final output.
- Keep rate-limit network work bounded and avoid reintroducing serial latency
  repaired in feature 19c.
- Use forward-only migrations and local Supabase only if application evidence
  proves the existing audit schema insufficient.
- Do not touch production configuration or infer hosted-provider behavior.

## Qualification evidence

- Focused web route, mobile-backed login, MFA lifecycle, recovery, audit,
  redaction, and URL-scrubbing tests pass.
- Calm Haven browser checks confirmed recovery and invitation credentials are
  removed from browser history immediately after capture.
- Invalid recovery credentials produced the same generic expired-link state,
  and an unknown recovery target produced the generic check-your-email state.
- React Strict Mode replay initially exposed a second-effect invitation capture
  bug; the capture is now guarded and the browser retest reaches the invitation
  form with the address bar scrubbed.
- Browser console inspection showed no application error or credential output.
- Hosted-provider behavior remains intentionally deferred to feature 19e.
- `npm run test` passed all 22 workspace tasks, including 424 web test files and
  3,637 web tests.
- `npm run type-check`, `npm run lint`, `npm run format:check`, the web
  workspace `email:build`, and `npm run build` passed. Lint retained five known
  non-blocking warnings and no errors.
