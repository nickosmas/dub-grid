# Feature: Invite, recovery, redirect, and CSRF integrity

**From build-plan:** feature 19d3
**Status:** verified
**Completed:** 2026-09-13

## Goal

Make every DubGrid invitation and password-recovery credential expire, bind to
the intended identity and action, and become unusable after its first successful
consumption. Keep all post-authentication navigation on an explicitly permitted
DubGrid path, and ensure every browser-originated state-changing request is
protected by one precise, fail-closed origin policy.

Preserve the existing invite-only product, web and native recovery experiences,
tenant isolation, and provider security boundaries. Return useful but generic
recovery states without revealing whether a dead credential was previously
valid, expired, accepted, revoked, or already used.

## In scope

- Inventory every invitation, email action, password-recovery, redirect, and
  browser-facing state-changing entry point across web, mobile, Supabase Auth,
  and the invitation SQL functions. Keep public, mobile bearer, webhook, and
  internal-job exceptions explicit and mechanically checked.
- Replace duplicated or raw `next`, `redirectTo`, and post-auth path handling
  with one tested internal-destination contract. Reject external, protocol-
  relative, malformed, backslash, encoded, control-character, credential, and
  unsupported action/destination combinations.
- Restrict email action handling to the Auth action types DubGrid actually
  supports, and bind each type to a safe destination. A valid token must never
  authorize an attacker-selected route.
- Harden `validateCsrfOrigin` so production browser mutations require a valid,
  same-origin DubGrid origin, including scheme, normalized host, and port. A
  sibling tenant, lookalike suffix, scheme downgrade, opaque `null` origin, or
  malformed header must fail closed without throwing.
- Cover every non-mobile browser POST, PUT, PATCH, and DELETE handler with the
  canonical CSRF check or a documented independently authenticated exception.
  Include authenticated lookup-style POST routes whose rate-limit state or
  privileged response can still be targeted cross-site.
- Verify invitation expiry, email binding, atomic first acceptance, concurrent
  acceptance, replacement-token invalidation, failed-delivery rollback, and
  replay behavior against local Supabase. Normalize dead-token responses and
  prevent duplicate memberships, employee links, notifications, or other side
  effects.
- Verify web recovery links and native six-digit recovery codes against the real
  local provider for expiry, single use, replay, wrong identity, wrong action
  type, and post-reset session revocation. An ordinary signed-in session must
  not be mistaken for recovery authorization by the reset UI.
- Keep email-scanner-safe confirmation behavior: loading a link may display an
  intermediate page, but only an explicit user action may consume a one-time
  Auth credential.
- Add structural, unit, route, local-Supabase integration, and browser coverage
  that fails when a new redirect consumer, public Auth action, or browser
  mutation bypasses classification.

## Out of scope

- Broad email or account enumeration resistance, distributed and per-target
  rate-limit design, CAPTCHA, token redaction across all logs and telemetry, and
  the complete security-event audit pass. Feature 19d4 owns those concerns.
- MFA assurance, fresh-auth step-up, credential-change assurance, and sensitive
  destructive actions already completed in feature 19d2.
- New authentication methods, magic-link sign-in as a product feature, social
  login, backup codes, passkeys, or lost-factor recovery.
- Replacing Supabase Auth or claiming DubGrid can override provider-owned token
  semantics. Provider behavior must be tested and any remaining boundary stated
  honestly.
- Redesigning invitation, forgot-password, or reset-password screens. Only
  security-required states, copy normalization, and recovery affordances may
  change.
- The complete release role/state/browser and physical-device matrix. Feature
  19e owns final release qualification.
- Production Auth configuration, production data, deployment, or migration
  application. Any confirmed schema repair is forward-only and local until the
  final production migration gate in feature 23.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files, and explains the security boundary.
4. You approve, then choose whether to commit a checkpoint or continue.
   Checkpoints are optional; `/complete` makes the feature-level commit.

Never accept a step you have not read. If a diff is too big to review, split the
step before implementation.

## Build steps

- [x] **Step 1 - Lock the entry-point inventory and contracts** - add explicit
      machine-checked classifications for Auth email actions, redirect consumers,
      browser mutation handlers, native bearer routes, signed webhooks, public
      forms, and internal jobs. Define the supported action-to-destination map
      and exact CSRF exemptions before changing runtime behavior. _Done when:_
      every current entry point is classified with one reason, a newly added
      unclassified redirect or mutating route fails the structural test, and
      mobile bearer, Stripe, cron, health, and read-only public exceptions cannot
      be mistaken for browser-cookie exemptions.
- [x] **Step 2 - Enforce one safe internal-destination policy** - build a shared
      parser for app-owned post-authentication navigation and use it in the Auth
      verification, PKCE callback, server confirmation, terms acceptance,
      login, and logout paths that accept or construct a destination. Validate
      Auth action types rather than casting query input, and constrain each
      supported type to its permitted destination. _Done when:_ valid internal
      paths retain their path, query, and fragment as allowed; external URLs,
      protocol-relative and backslash variants, encoded bypasses, credentials,
      control characters, malformed input, and unsupported type/destination
      pairs resolve to a fixed safe fallback before token consumption or
      navigation.
- [x] **Step 3 - Make CSRF enforcement precise and exhaustive** - replace the
      root-domain comparison with a tested same-origin production policy that
      normalizes scheme, host, and default port, handles trusted proxy metadata
      deliberately, and returns a safe 403 for absent, opaque, or malformed
      origins. Add the missing guard to browser-authenticated POST lookups and
      enforce the Step 1 route inventory. Preserve the anonymous native consent
      sync only through an explicit no-cookie path whose declared Origin matches
      the API endpoint. _Done when:_ the exact tenant origin succeeds, sibling
      tenants and lookalike domains fail, HTTPS cannot be downgraded, malformed
      input cannot produce a 500, no protected handler executes after a CSRF
      denial, and every exemption proves its independent credential or lack of
      browser state.
- [x] **Step 4 - Normalize invitation API capability handling** - audit creation,
      lookup, registration, acceptance, resend, replacement, revoke, and delivery
      failure routes around one live-token definition. Bind registration and
      acceptance to the normalized invited email and active organization, and
      return one external dead-invitation contract without hiding recoverable
      infrastructure failures. _Done when:_ unknown, expired, revoked, accepted,
      wrong-account, and replayed tokens expose no lifecycle distinction; a dead
      token cannot create or alter an account; valid first-time and existing-
      account flows remain recoverable; and route tests prove no downstream
      operation or notification runs after rejection.
- [x] **Step 5 - Prove atomic invitation transitions in SQL** - exercise first
      acceptance, concurrent acceptance, resend, access replacement, revocation,
      and failed-delivery rollback against local Supabase, then add a forward
      migration only for confirmed gaps. Keep row locking and grants explicit,
      and emit membership, employee-link, notification, and audit side effects
      only for the winning transition. _Done when:_ simultaneous acceptance has
      one winner; replay performs no mutation; old and undelivered replacement
      tokens cannot be used; rollback restores only its intended prior invite;
      and memberships, employee links, claims locks, notifications, and audit
      effects are not duplicated.
- [x] **Step 6 - Harden web recovery capability handling** - verify the local
      provider's PKCE and email-token expiry and single-use behavior, keep the
      scanner interstitial non-consuming, and require recovery-specific proof
      before the reset form treats a session as authorized. Consume the
      credential once, remove it from browser-visible navigation immediately,
      reject wrong action types and replay, and preserve a recoverable generic
      state for transport failure. _Done when:_ an ordinary session cannot open
      an authorized reset form, a valid recovery link works once, a scanner GET
      does not consume it, second use and expired or malformed credentials fail
      identically, an external destination never runs, and a successful reset
      revokes the intended prior sessions before returning to sign-in.
- [x] **Step 7 - Harden native recovery parity** - verify the six-digit code
      flow with the ephemeral Supabase client and enforce the same expiry,
      action, identity, first-use, replay, and global-sign-out outcomes as web.
      Preserve anti-enumeration request UX and ensure no recovery session reaches
      SecureStore or the authenticated tab tree. _Done when:_ valid recovery
      succeeds once; wrong, expired, already-used, and wrong-account codes fail
      safely; retry and resend never reuse a consumed capability; password save
      uses only the verified ephemeral session; and success leaves no persistent
      recovery session or previously active device session.
- [x] **Step 8 - Qualify the complete integrity boundary** - run focused unit,
      route, structural, component, SQL, and local-Supabase integration tests,
      followed by the full test suite, type-check, lint, formatting, and
      production build. Exercise Calm Haven invitation and web recovery flows in
      a browser, then run the available native recovery flow without using
      production credentials. _Done when:_ invitation and recovery credentials
      are time-bound and single-use, redirects stay on approved DubGrid paths,
      browser mutations reject cross-origin requests before side effects, all
      automated gates pass, browser console and network checks are clean, and
      unavailable native-device or hosted-provider evidence is recorded for
      feature 19e rather than inferred.

## Qualification evidence

- Full repository tests passed: 22 of 22 tasks, including 419 web test files
  and 3,623 web tests.
- Type-check, lint, formatting, generated Auth email templates, and the
  production build passed. Lint retained five unrelated warnings and no errors.
- Calm Haven browser smoke checks confirmed scanner-safe recovery consumption,
  generic invalid-recovery feedback, rejection of an external destination, and
  generic dead-invitation feedback without account creation.
- Focused native recovery tests passed 32 checks across request and reset flows,
  including wrong-account, replay, ephemeral-session, and sign-out-failure
  handling. Physical-device and hosted-provider evidence remains for feature
  19e.

## Files / areas

- `apps/web/src/lib/csrf.ts`, a shared internal-destination helper under
  `apps/web/src/lib/auth/`, and adjacent unit tests
- `apps/web/src/app/(app)/auth/callback/route.ts`,
  `apps/web/src/app/(app)/auth/confirm/route.ts`,
  `apps/web/src/app/(app)/auth/verify/page.tsx`, terms acceptance, login, logout,
  forgot-password, and reset-password flows
- `apps/web/src/app/api/invitations/lookup/route.ts`, `register/route.ts`,
  `accept/route.ts`, organization invitation routes, and their tests
- Browser-facing handlers under `apps/web/src/app/api/`, especially
  `employees/check-email`, `employees/check-phone`, and `users/check-email`, plus
  the authorization and public-route structural inventories
- `apps/mobile/src/features/auth/screens/ForgotPasswordScreen.tsx`,
  `ResetPasswordScreen.tsx`, ephemeral Supabase-client helpers, and tests
- `supabase/migrations/001_schema.sql`, `002_functions_triggers.sql`,
  `010_invitation_auto_revoke_audit.sql`,
  `012_replace_pending_invitation_access.sql`, later ordered migrations, and
  Auth template/config fixtures used for local verification
- `apps/web/src/emails/auth/`, generated `supabase/templates/`, and
  `supabase/config.toml` only when a confirmed template or local-provider gap
  requires a checked-in change
- Existing Auth, invitation, recovery, CSRF, authorization-boundary, and
  Playwright coverage under `apps/web/src/**`, `apps/mobile/src/**`, and
  `apps/web/e2e/`
- `docs/authentication.md` or a focused integrity-boundary document if the final
  provider and exemption contract needs durable explanation

## Data / contracts

- Invitation tokens remain opaque UUID credentials with a 72-hour database
  expiry. A token is live only while `accepted_at` and `revoked_at` are null,
  the organization is active, and the authenticated account email matches the
  normalized invited email.
- Invitation acceptance is one atomic state transition. Only that transition
  may create or update membership, link or create an employee, refresh claims,
  and emit acceptance side effects. Replay returns the generic dead-invitation
  contract and performs no work.
- Supabase recovery credentials keep the configured one-hour local expiry unless
  provider evidence requires a deliberate plan change. Web PKCE codes, email
  token hashes, and native OTP codes are separate representations of the same
  recovery capability and cannot be accepted as another action type.
- The internal-destination helper accepts only normalized app-relative paths
  allowed for the named Auth action. It returns a fixed action-specific fallback,
  never an absolute URL, and callers must use the parsed value rather than raw
  query input.
- Browser CSRF validation compares the request's authoritative endpoint origin
  with a syntactically valid `Origin`. Production requests with absent, `null`,
  malformed, cross-scheme, cross-host, cross-port, sibling-tenant, or lookalike
  origins are denied before authentication, body parsing, rate limiting, data
  access, or mutation.
- Native bearer endpoints, signed webhooks, secret-authenticated jobs, and
  read-only public handlers do not inherit a browser-cookie exemption. Each is
  separately classified and must prove its own boundary.
- External responses use stable, generic invitation, recovery, redirect, and
  CSRF errors. Logs and tests may distinguish safe internal reason codes, but
  never record raw invitation tokens, recovery credentials, passwords, session
  tokens, or email action secrets.
- Do not rewrite applied migrations. If local integration exposes a database
  gap, add one ordered forward migration with explicit grants, fixed
  `search_path`, concurrency coverage, and rollback-free production semantics.

## Testing

- Table-driven and property-oriented tests cover destination parsing, supported
  Auth action mappings, Unicode and percent-encoding edge cases, malformed URLs,
  backslashes, protocol-relative forms, query and fragment preservation, and
  safe fallbacks.
- CSRF unit and route tests cover exact tenant origins, apex and tenant hosts,
  sibling tenants, suffix lookalikes, scheme and port mismatches, proxy headers,
  absent and `null` origins, malformed values, development behavior, native
  anonymous consent, and denial before every downstream operation.
- Structural tests inventory every Route Handler method and redirect consumer.
  A new browser mutation, public/system exception, or raw post-auth destination
  fails until it is classified and protected.
- Invitation route and local-Supabase tests cover dead states, normalized email
  binding, concurrent first acceptance, replay, resend, revoke, replacement,
  failed-delivery rollback, membership and employee uniqueness, and one-time
  notification or audit effects.
- Recovery component, route, and local-provider tests cover web PKCE, token hash,
  scanner interstitial, native OTP, expiry, wrong type and identity, replay,
  ordinary-session rejection, ephemeral storage, password update, and global
  session revocation.
- Run focused tests after each logic-bearing step. Before review, run
  `npm run test`, `npm run type-check`, `npm run lint`, changed-file Prettier,
  `git diff --check`, and `npm run build` against the exact owned candidate.
- Use Calm Haven for normal browser testing. Use disposable local invitation and
  recovery users, clean them up after integration tests, and use another local
  organization only for a negative sibling-origin or tenant-boundary check.

## Notes for the AI

- Start from evidence. Current code already filters live invitation lookups,
  locks `accept_invitation` with `FOR UPDATE`, uses an ephemeral native recovery
  client, and has partial relative-path checks. Preserve correct behavior and
  repair only demonstrated gaps.
- The current `/auth/verify` page passes raw `next` input to `router.replace`
  after successful token verification. Treat this as a confirmed redirect gap,
  not as evidence that every redirect caller is broken.
- The current `employees/check-email`, `employees/check-phone`, and
  `users/check-email` POST routes authenticate and rate-limit but do not call the
  canonical CSRF validator. Cover them without trusting POST or CORS as a CSRF
  defense.
- Do not keep the current naive registrable-domain calculation as the security
  boundary. A tenant request must not accept a sibling tenant merely because the
  two hosts share a root domain.
- Do not consume a one-time Auth token in a GET that an email security scanner
  can prefetch. The explicit Continue action is part of the security contract.
- Do not infer recovery authority from the presence of any session. Prove the
  provider's recovery-session signal locally and document the provider-owned
  limit if it cannot be distinguished strongly enough.
- Keep public error responses generic, but do not fold infrastructure failures
  into a false success when that would strand an already-created invited account.
  Preserve an explicit retry path without exposing credential state.
- Keep feature 19d4 boundaries intact: do not broaden this step into global
  enumeration, rate-limit, logging, telemetry, or audit redesign.
- Never touch production, remote Supabase Auth settings, deployed email
  templates, or production data. Checked-in config and templates are local
  evidence only until an explicitly authorized release operation.
