# Feature: MFA assurance and sensitive-action reauthentication

**From build-plan:** feature 19d2
**Status:** verified
**Completed:** 2026-09-13

## Goal

Require a recent, server-verifiable human authentication step before DubGrid
changes authentication factors or credentials, revokes other sessions, exports
personal data, deletes accounts or organizations, or approves another person's
account deletion. Accounts with a verified TOTP factor must present fresh AAL2
proof; accounts without one must present a fresh password proof.

Keep ordinary authenticated work fast, preserve current-session sign-out as an
unconditional safety exit, and make the same assurance decision on web and
mobile without trusting client state or a denormalized profile flag.

## In scope

- Define one five-minute sensitive-action window from signed, validated JWT
  `amr` timestamps. A token refresh may rotate `iat`, but must not extend the
  human-authentication window.
- Resolve the user's current verified factors from Supabase Auth. If a verified
  TOTP factor exists, sensitive actions require a current AAL2 token and a
  recent TOTP `amr` entry. Otherwise they require a recent password `amr` entry.
- Return one safe, structured step-up-required contract that tells web and
  mobile which supported method to request without exposing factor secrets or
  account details.
- Add reusable web and mobile step-up experiences that preserve the pending
  action, refresh the active session with the newly verified token, retry only
  after successful verification, and fail closed on cancel, timeout, wrong
  password, wrong code, factor drift, or expired proof.
- Apply the policy to authenticated email and password changes, TOTP enrollment
  and disablement, revoking another device, signing out other or all devices,
  personal data export, self-deletion, GDPR erasure, organization deletion,
  Gridmaster force logout, and approval of an account-deletion request.
- Treat Supabase Auth as the final enforcement boundary for its public
  credential and factor APIs. Verify its secure-password-change, AAL, and factor
  rules locally before relying on them; app-owned server routes still enforce
  DubGrid's stricter five-minute policy themselves.
- Reconcile `profiles.mfa_enabled` from live verified Supabase Auth factors
  after factor changes. The client may request reconciliation but may not set
  the authoritative boolean.
- Add maintainable coverage that makes every known sensitive action explicit
  and prevents a newly added credential, factor, session, export, or destructive
  account or organization endpoint from bypassing the assurance policy.

## Out of scope

- Invite, recovery, password-reset callback, redirect, and CSRF hardening;
  feature 19d3 owns those flows. A valid recovery session must remain able to
  set a new password without an impossible second step.
- Enumeration resistance, distributed rate limits, secret redaction, and the
  complete security-event audit pass; feature 19d4 owns those concerns. Existing
  CSRF, rate-limit, notification, and audit behavior must not regress.
- The broad role, account-state, browser, and physical-device release matrix;
  feature 19e owns final release qualification.
- Requiring step-up for ordinary profile edits, schedule changes, settings
  maintenance, invitation management, or routine organization administration.
- Blocking local sign-out of the current session. A user must always be able to
  leave the app, including when Supabase or the step-up service is unavailable.
- New authentication methods, backup codes, lost-factor recovery, passkeys, or
  a redesign of the sign-in, account, or security pages.
- Production configuration changes, production database access, deployment,
  or migration application. Feature 23 remains the final release gate.
- Claiming that a client-side prompt or DubGrid endpoint prevents direct calls
  to Supabase Auth. The approved MFA boundary keeps Supabase's session-level
  AAL2 rule for direct factor removal, which does not enforce five-minute
  freshness. DubGrid endpoints enforce the stricter window. Other credential
  mutations still require independent qualification; report any new gap.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the assurance contract** - extend verified web and mobile
      claim types with validated AAL and `amr` data, then add a pure evaluator
      for the five-minute policy and its clock boundaries. Base recency on the
      required authentication method's `amr.timestamp`, never JWT `iat`, token
      refresh time, client clocks, or `profiles.mfa_enabled`. _Done when:_
      table-driven tests accept recent password proof for a no-factor account
      and recent TOTP plus AAL2 for a TOTP account, reject missing, malformed,
      future, stale, wrong-method, and AAL1 proof, and prove that refreshing an
      access token does not renew the window.
- [x] **Step 2 - Enforce one server-side step-up boundary** - build canonical
      web-cookie and bearer-token helpers that combine the existing live-session
      check, live verified-factor lookup, and the Step 1 evaluator. Return a
      shared `STEP_UP_REQUIRED` response with only the required method and a safe
      retry message; keep unavailable identity or factor verification fail
      closed. _Done when:_ focused tests prove that both transports reach the
      same decision, an untrusted client cannot choose its required method, and
      a route does not execute its protected operation before the helper passes.
- [x] **Step 3 - Make MFA lifecycle state authoritative** - require recent
      password proof before starting TOTP enrollment, first verify Supabase's
      real enroll, verify, and unenroll assurance rules, use the exact AAL2
      session returned by TOTP verification to complete enrollment, and require
      a fresh TOTP challenge immediately before disabling verified factors.
      Replace the client-supplied MFA boolean on web and mobile with server
      reconciliation from live verified factors, including cleanup of abandoned
      unverified factors. _Done when:_ provider integration tests establish the
      actual mutation boundary, stale or AAL1 tokens cannot disable TOTP through
      DubGrid's protected endpoints,
      cancel and failure leave the prior verified state intact, the last verified
      factor cannot be silently removed through the DubGrid flow, and both apps
      show the reconciled Auth state after success or retry.
      Split into reviewable substeps because server reconciliation and the two
      challenge/session flows are separate integration changes:

  - [x] **Step 3a - Server-authoritative status** - reconcile both status
        endpoints from live factors, accept legacy boolean bodies only for
        compatibility, and fail closed on invalid provider state. Cover the
        provider's omitted-empty-factor representation without mistaking
        malformed responses for disabled MFA.
  - [x] **Step 3b - Guarded lifecycle flows** - integrate protected
        enrollment/disablement, fresh challenges, exact promoted sessions,
        safe pending-factor cleanup, and retryable reconciled UI in both apps.

- [x] **Step 4 - Add the web step-up experience** - create one accessible,
      reusable web challenge that asks for the account password when no verified
      TOTP factor exists and for a six-digit authenticator code when it does.
      Integrate it with email and password changes, other-device or all-device
      session revocation, MFA changes, and the existing web destructive-action
      confirmations without losing typed form state. _Done when:_ each protected
      action pauses on `STEP_UP_REQUIRED`, succeeds once with fresh proof, does
      not double-submit on retry, preserves the current organization context,
      and leaves the pending action unchanged on cancel, expiry, or error.
      Split into independently reviewable integrations:

  - [x] **Step 4a - Reusable challenge and one-device revocation** - preserve
        the pending callback, use the server-selected password/TOTP method,
        forward the exact renewed token once, and cancel safely on context
        changes or unmount. Protect single-device revocation on the server;
        current-device local sign-out stays independent.
  - [x] **Step 4b - Remaining session and MFA integrations** - reuse the
        challenge for other/all-device sign-out and consolidate MFA prompts
        without regressing lifecycle cleanup or status reconciliation.
    - [x] **Step 4b1 - Bulk sign-out boundary and challenge** - distinguish
          other-device from all-device revocation, require fresh server-verified
          proof for both, preserve the freshly authenticated current session for
          other-device sign-out, and keep local sign-out unconditional.
    - [x] **Step 4b2 - MFA prompt reuse** - consolidate enrollment/password and
          removal/TOTP prompts without replaying ambiguous MFA mutations or
          changing enrollment cleanup and provider status reconciliation.
    - [x] **Step 4b3 - Enrollment banner synchronization** - use server-reconciled
          MFA status for the advisory banner and refresh account queries after
          a confirmed MFA change. Done when successful enrollment hides the
          banner without a reload, reload keeps it hidden, and failed or
          incomplete enrollment does not hide it. Authorization remains based
          on live factors and verified assurance, not the advisory profile flag.
  - [x] **Step 4c - Credentials and destructive confirmations** - independently
        qualify provider credential rules and integrate email/password changes
        plus existing destructive-action confirmations. Step 6 still owns the
        complete destructive server-action inventory and enforcement.
    - [x] **Step 4c1 - Credential assurance** - add a server-checked assurance
          preflight for public provider credential mutations, then require it
          before web email or password changes without saving any part of an
          account-details draft before identity confirmation.
    - [x] **Step 4c2 - Destructive confirmation integration** - reuse the web
          challenge from existing destructive confirmation surfaces while
          leaving authoritative destructive-route coverage to Step 6.

- [x] **Step 5 - Add mobile assurance parity** - implement the same challenge and
      retry contract in the native security flows, using the promoted
      `verifiedSession.access_token` after TOTP verification and the newly
      password-authenticated session when password proof is required. Apply it
      to mobile password and MFA changes plus revoking another listed session;
      keep current-device sign-out available. _Done when:_ component and API
      tests prove method selection, session replacement, pending-action retry,
      cancellation, wrong-code and wrong-password handling, and parity with web
      for identical factor and recency states.
  - [x] **Step 5a - Reusable challenge and one-device revocation** - preserve the
        pending native callback, use the server-selected password or TOTP
        method, install the promoted session, forward its exact access token
        once, and cancel safely on account, organization, expiry or screen
        changes. Protect another-device revocation on the mobile server route;
        current-device sign-out remains independent.
  - [x] **Step 5b - Password and MFA integrations** - reuse the native challenge
        for password changes plus MFA enrollment and removal without replaying
        ambiguous provider mutations or regressing lifecycle reconciliation.
- [x] **Step 6 - Cover every destructive server action** - replace the current
      live-only `requireFreshAuth` use with the canonical policy for personal
      data export, self-deletion, and GDPR erasure, then protect organization
      deletion, Gridmaster force logout, and only the approval branch of an
      account-deletion request. Add an explicit structural inventory for these
      and all credential, factor, and session-changing entry points. _Done when:_
      stale proof returns `STEP_UP_REQUIRED` before data access or mutation,
      fresh proof preserves every existing permission, confirmation, sandbox,
      rate-limit, notification, audit, and cleanup rule, ordinary request
      approval remains unaffected, and a newly unclassified sensitive endpoint
      fails the coverage guard.
- [x] **Step 7 - Qualify the complete assurance boundary** - run focused unit,
      Route Handler, component, structural, and local-Supabase integration tests,
      followed by the full test suite, type-check, lint, and production build.
      Manually exercise Calm Haven on web as an account with TOTP and one without
      it, then run the available mobile API or simulator checks for the same
      states. _Done when:_ each protected action requires the correct method,
      fresh proof expires after five minutes even across token refresh, stale or
      downgraded sessions fail closed, current-session sign-out still works
      during failure, and any unavailable native-device evidence is recorded for
      feature 19e rather than inferred.

## Files / areas

- `apps/web/src/lib/auth/verify-token.ts`, `apps/web/src/lib/api-auth.ts`, and a
  focused shared assurance module and tests under `apps/web/src/lib/auth/`
- `packages/mobile-api-core/src/auth.ts`, shared mobile API error contracts, and
  mobile request helpers under `apps/mobile/src/shared/lib/`
- `apps/web/src/components/profile/MFASetup.tsx`,
  `apps/web/src/components/account/SecurityPanel.tsx`,
  `apps/web/src/components/account/ProfilePanel.tsx`, and a reusable web
  step-up dialog or hook
- `apps/mobile/src/features/profile/screens/ProfileTwoFactorScreen.tsx`,
  `ProfilePasswordScreen.tsx`, `ProfileSessionsScreen.tsx`, and reusable mobile
  challenge UI/state
- Web and mobile MFA-status and session routes, plus the existing data export,
  account deletion, GDPR erasure, organization deletion, Gridmaster force
  logout, and profile-change-request resolution routes
- `apps/web/src/__tests__/privileged-authorization-boundaries.test.ts`, adjacent
  route and component tests, local Supabase integration coverage, and
  `docs/authentication.md`
- `supabase/config.toml` only if qualification proves the checked-in local
  secure-password-change setting or template wiring needs correction. Do not
  change provider behavior speculatively.

## Data / contracts

- Verified JWT claims include `aal` and an `amr` array of authentication method
  plus epoch-second timestamp entries. Missing or malformed assurance claims
  are denial, not an AAL1 fallback.
- The fixed sensitive-action freshness window is five minutes, evaluated on the
  server with bounded future-clock tolerance. Refreshing a token preserves the
  original method timestamp and cannot extend freshness.
- Required method is derived from live Supabase Auth factors: verified TOTP
  means recent `totp` plus current `aal2`; no verified TOTP means recent
  `password`.
- `STEP_UP_REQUIRED` is a shared 403 contract containing a stable code,
  supported method (`password` or `totp`), and safe user-facing message. It does
  not contain factor IDs, emails, secrets, internal causes, or authorization
  details.
- `profiles.mfa_enabled` remains a denormalized display field only. Server
  reconciliation writes it from live verified factors; a request body cannot
  assert the value.
- Step-up does not replace the existing session, permission, tenant, CSRF,
  confirmation, sandbox, rate-limit, notification, audit, or cleanup boundary.
  It is an additional prerequisite immediately before the protected action.
- DubGrid-owned routes enforce the five-minute policy on the server. Supabase
  Auth-owned credential and factor mutations must satisfy both a server-checked
  DubGrid assurance preflight and the provider's own secure password, AAL, and
  factor requirements; neither layer is represented as stronger than tests
  prove.
- Prefer signed Supabase AAL and `amr` proof over a new receipt table or custom
  long-lived token. Add no schema unless implementation evidence proves the
  provider claims cannot support the contract.

## Testing

- Pure unit tests cover parsing and evaluating AAL and `amr`, exact five-minute
  boundaries, future timestamps, method selection, malformed claims, and factor
  state.
- Route tests assert that stale proof cannot reach sensitive reads, service-role
  writes, Auth Admin calls, Stripe cancellation, session revocation, or account
  deletion, while fresh proof retains each route's existing checks.
- Web and mobile component tests cover password and TOTP prompts, correct token
  replacement, retry-once behavior, form preservation, cancellation, expiry,
  factor drift, and accessible errors without logging credentials or codes.
- Local Supabase integration tests verify real password, refresh, TOTP
  challenge, AAL2, factor enrollment and disablement behavior. They must assert
  only safe claim metadata and clean up temporary factors and sessions.
- Structural coverage inventories sensitive entry points and fails when a new
  credential, factor, session, export, account deletion, or organization
  deletion path lacks an explicit policy classification.
- Run focused tests after every logic-bearing step. Before review, run
  `npm run test`, `npm run type-check`, `npm run lint`, and `npm run build` from
  the exact isolated candidate required by `AGENTS.md`, plus relevant E2E or
  authenticated browser checks when supported.
- Use Calm Haven for normal manual testing. Use another organization only if a
  negative tenant-boundary check is required, and do not infer native-device
  behavior from web or API tests.

## Notes for the AI

### Step 7 verification (2026-09-13)

- Added a checked-in local Supabase integration regression that owns and removes
  a disposable Auth user. It proves real password proof, password-token refresh,
  TOTP enrollment and verification, AAL2 promotion, AAL2-token refresh, live
  factor method selection, AAL1 downgrade rejection, five-minute expiry against
  the unchanged method timestamp, and verified-factor removal. It asserts only
  safe claim metadata and leaves no temporary user or factor behind.
- Focused assurance coverage passed 299 tests: 27 shared evaluator tests, 214
  web Route Handler/component/structural tests, and 58 mobile API/component tests.
  The integration regression passed repeatedly against the running local
  Supabase stack.
- The complete root suite passed all 22 tasks with 412 web files / 3,540 web
  tests plus the full mobile and shared-package suites. A post-type-guard rerun
  passed 411 files / 3,535 tests but one unrelated settings suite failed to load
  after a 41-minute Vitest worker-to-Vite module-fetch timeout; that exact suite
  then passed 5/5 in isolation in two seconds. This was an infrastructure stall,
  not an assertion failure or waived product failure.
- `npm run type-check` passed all 24 tasks plus root checking. `npm run lint`
  passed with zero errors and the same five existing warnings. `npm run build`
  passed all 11 tasks and generated all 87 static pages. Prettier and
  `git diff --check` passed.
- Calm Haven browser evidence covers both factor states: the earlier authenticated
  TOTP account check confirmed enabled status and no stale MFA warning after
  refresh; this pass signed in the seeded no-TOTP QA account, observed its live
  disabled-factor state, and exercised the recent-password path. The action was
  still inside the five-minute window and therefore correctly proceeded without
  another prompt; its temporary QA password change was immediately restored to
  the seeded value, hash-verified, and the account was signed out. Stale and
  refreshed-token behavior is covered by the real provider regression rather
  than a five-minute browser wait.
- The running Android emulator signed the no-TOTP QA account into Calm Haven,
  displayed the expected Security & sessions state and the distinct other-device
  versus everywhere actions, and allowed unconditional current-device Sign Out
  back to login. No iOS simulator was booted. A TOTP-enabled native account and
  physical-device pass were unavailable and are explicitly carried into feature
  19e; they are not inferred from web or component tests.
- No production data, deployment, migration, provider setting, commit or push
  was performed. The only local mutations were disposable integration data and
  the restored seeded QA credential described above.

### Step 6 verification (2026-09-13)

- Personal data export, direct account deletion, and GDPR erasure now use the
  canonical live five-minute password-or-TOTP assurance guard instead of the
  removed liveness-only `requireFreshAuth` helper. A stale proof returns the
  structured `STEP_UP_REQUIRED` response before service-role data access.
- Organization deletion retains CSRF, sandbox, super-admin, effective-org,
  confirmation, rate-limit, Stripe, cache, audit and error behavior, then adds
  sensitive assurance before reading or mutating the organization. Gridmaster
  force logout likewise keeps its live Gridmaster gate, revocation, audit and
  notification behavior while stopping stale proof before target resolution.
- People request resolution reads the effective-org request once to classify
  it, requires step-up only for approval of an account-deletion request, and
  passes that exact pending record into the existing resolution path. Profile
  approvals and every rejection path remain unchanged.
- Added an exact structural inventory for web and delegated mobile credential,
  factor, session-changing, export, and destructive account or organization
  entry points. It also classifies invitation-token credential creation and
  permission-gated revocation of another user's sessions, so a newly matching
  endpoint fails until its policy is explicit.
- Focused route, server, and structural coverage passed 36 tests across ten
  files; the affected web workspace type-check passed. The final root suite
  passed all 22 tasks, including 136 mobile files / 1,095 tests and 411 web
  files / 3,539 tests. `npm run type-check` passed all 24 tasks plus root
  checking; `npm run lint` passed with zero errors and the same five existing
  warnings; `npm run build` passed all 11 tasks and includes every protected
  route. Formatting and `git diff --check` passed.
- This was a server-only enforcement pass. No destructive action, credential,
  factor or session mutation, browser or native manual test, commit, push,
  deployment, migration, provider setting or production data was changed.

### Step 5b verification (2026-09-13)

- Mobile password changes now run a bearer-token credential-assurance preflight
  through the shared native step-up hook immediately before Supabase's public
  password mutation. The old duplicate current-password field is gone; the
  server selects password or TOTP in the reusable challenge. Cancelling restores
  the confirmation with the new-password draft intact, and a provider mutation
  failure is not replayed automatically.
- Mobile TOTP enrollment and removal reuse the same challenge and exact promoted
  token. The preflight completes before stale-factor cleanup, enrollment or
  removal begins. Enrollment verification still reconciles with the exact AAL2
  session returned by Supabase; uncertain removal outcomes switch to status
  reconciliation rather than retrying the factor mutation.
- Added a no-store mobile credential-assurance route backed by the canonical
  five-minute sensitive-action guard, plus exact bearer-token API coverage.
  Authorization inventories classify the new route and prove that a structured
  denial is returned before any provider mutation can be reached.
- Focused mobile coverage passed 47 tests across the password, MFA, reusable
  challenge and API files. The mobile-server route and both structural
  authorization inventories passed 10 tests. Both workspace type-checks passed.
- The final root suite passed all 22 tasks, including 136 mobile files / 1,095
  mobile tests and 408 web files / 3,530 web tests. `npm run type-check` passed
  all 24 tasks plus root checking; `npm run lint` passed with zero errors and the
  same five existing warnings; `npm run build` passed all 11 tasks and includes
  `/api/mobile/v1/profile/credential-assurance`.
- The first parallel root type-check saw stale generated Next route types while
  the build was regenerating them; the build completed successfully and the
  required serial rerun passed. No native simulator or physical-device result
  is inferred here. No live password, factor or session mutation, commit, push,
  deploy, migration, provider setting or production data was changed.

### Step 5a verification (2026-09-13)

- Added one reusable native identity-confirmation sheet and pending-action hook.
  The hook accepts only a structured server `STEP_UP_REQUIRED` denial, keeps the
  original callback, selects password or TOTP from the server response, clears
  entered proof before each attempt, installs the TOTP-promoted session, and
  retries once with the exact renewed access token.
- Pending work is keyed to the authenticated account and organization rather
  than the rotating token string. Token refresh remains valid, while account,
  organization, screen or factor changes cancel or fail closed. Wrong password
  and code failures keep the challenge retryable; an ambiguous mutation failure
  is never replayed automatically.
- Mobile another-device revocation now uses the canonical sensitive-action
  server guard before reading its mutation body or revoking a session. The
  selected device and its confirmation remain intact after challenge cancel or
  failure. Current-device and existing bulk sign-out behavior remain unchanged.
- The first focused run exposed a pending-context field mismatch in the new
  hook; it was corrected before handoff. Final focused coverage passed 44 tests
  across five mobile files and 53 tests across four mobile-server and structural
  authorization files.
- The root suite passed all 22 tasks in 6m25s, including 407 web files / 3,528
  web tests plus mobile and shared packages. `npm run type-check` passed all 24
  tasks plus root checking; `npm run lint` passed with zero errors and the same
  five existing warnings; `npm run build` passed all 11 tasks. Formatting and
  `git diff --check` passed.
- Step 5 remains open for Step 5b, which reuses this challenge for mobile
  password and MFA changes. No native simulator or physical-device result is
  inferred from component tests. No live session or factor mutation, commit,
  push, deploy, migration, provider setting or production data was changed.

### Step 4c2 verification (2026-09-13)

- Existing web organization deletion, both Gridmaster force-logout views, and
  only the approval branch of an account-deletion request now reuse the shared
  server-selected password or TOTP challenge before their destructive callback.
  Ordinary profile approvals and all rejection paths remain unchanged.
- Each protected callback runs the credential-assurance preflight first and
  forwards the exact current or promoted bearer token to the destructive API.
  Structured `STEP_UP_REQUIRED` errors retain their status, code and method so
  the shared hook can challenge and retry once when Step 6 adds authoritative
  route enforcement.
- Existing confirmation state is preserved across challenge cancellation or
  failure: the underlying confirmation is hidden while the challenge is open,
  then restored with typed organization confirmation intact. No destructive
  callback runs when proof is cancelled or rejected.
- Focused component, hook and client coverage passed 34 tests across seven
  files. The root suite passed all 22 tasks, including 407 web files / 3,527
  web tests plus mobile and shared packages. `npm run type-check` passed all 24
  tasks plus root checking; `npm run lint` passed with zero errors and the same
  five existing warnings; `npm run build` passed all 11 tasks and included the
  credential-assurance route. Changed-file formatting and `git diff --check`
  passed.
- Step 4 is complete. Step 6 still owns the complete destructive-route
  inventory and authoritative server-side enforcement, including personal data
  export, self-deletion and GDPR erasure, which have no existing confirmation
  consumer to integrate here. No live destructive action, commit, push, deploy,
  migration, provider setting or production data was changed.

### Step 4c1 verification (2026-09-13)

- Added a CSRF-protected credential-assurance preflight backed by the canonical
  live-factor and five-minute policy. The client forwards the exact current or
  promoted bearer token with an abortable deadline; no credential mutation
  runs before the preflight succeeds.
- Web email and password changes now use the shared server-selected password or
  TOTP challenge. Password confirmation no longer duplicates a current-password
  field; accounts with a verified TOTP factor receive the authenticator flow.
  Cancel restores the original confirmation and preserves the typed draft.
- Account details that include an email change do not persist names, phone or
  work fields before identity confirmation. Provider mutations are executed
  once and are not automatically replayed after an ambiguous error.
- Supabase's checked-in secure-password-change and double-confirmed-email
  settings were reviewed against current official documentation. They do not
  implement DubGrid's five-minute rule. The accepted direct-provider limitation
  and the new UI preflight are documented in `docs/mfa-provider-boundary.md`;
  no provider or production configuration was changed.
- Focused credential, account, route and shared-assurance coverage passed 107
  tests before the full run. The root suite then passed all 22 tasks: 406 web
  files / 3,517 tests plus mobile and shared packages. Two final regressions
  added afterward passed with the affected set: 31 tests across four files.
- `npm run type-check` passed all 24 tasks plus root checking. `npm run lint`
  passed with zero errors and the same five existing warnings. `npm run build`
  passed all 11 tasks and included the new route. Changed-file formatting and
  `git diff --check` passed.
- Step 4c remains open for Step 4c2, which integrates the reusable challenge
  with existing destructive confirmation UI. Step 6 remains the authoritative
  destructive-route inventory and enforcement pass. No commit, push, deploy,
  migration, credential change or browser-submitted mutation was performed.

### Step 4b3 verification (2026-09-13)

- The warning read factors from a JWT-derived user that has no factor list.
  Permissions now reads the existing server-reconciled profile snapshot for
  this advisory flag only. Live-factor authorization is unchanged.
- Successful MFA reconciliation invalidates the current user's account-query
  prefix, refreshing the banner and profile without reloading. Other users'
  cached permissions remain untouched. No persistent dismissal is written.
- Five new tests cover missing profile state, mounted-banner disappearance
  without reload, reversible banner visibility, and account-scoped cache
  invalidation for both enrollment and removal. Existing failed/incomplete
  enrollment tests remain green.
- Full root tests passed all 22 tasks in 6m52s: 405 web files / 3,512 tests;
  unchanged mobile/shared tasks reused passing cache entries. Type-check,
  lint (zero errors, five existing warnings), build, formatting and diff
  checks passed. No excluded tests or raised timeouts.
- Authenticated Calm Haven showed enabled MFA with no warning after refresh;
  captured browser console had no warnings or errors. No-reload transition is
  covered by the mounted-banner integration test, not another live enrollment.
  The user's MFA remains enabled. No code, credentials or factor changes were
  submitted through the browser during this repair.
- This repair is ready for review. Step 4c is still next; the wider feature
  remains in progress. Audit/check/try gates remain manual. No commit, push,
  deployment or production configuration change was made.

### Step 4b2 verification (2026-09-13)

- `StepUpForm` centralizes password/TOTP input, accessible error association,
  equal-width peer actions, synchronous duplicate-submit/dismissal protection,
  and clearing credentials before each attempt. `StepUpDialog` retains the
  existing modal and its pending-dismissal veto around that form.
- MFA enrollment and removal reuse the form inline, with explicit setup and
  disablement copy. Their existing mandatory password/TOTP challenges,
  protected lifecycle calls, exact promoted token, QR/issuer handling,
  pending-factor cleanup and status-only recovery remain unchanged. The
  removal action is explicitly labeled `Disable 2FA`.
- Eight new regressions cover shared-form validation/latching/failure handling,
  rejected password clearing and error association, pending-proof cancellation,
  cancelled removal, and status recovery after an ambiguous removal timeout.
  All 45 focused tests passed, including existing session step-up consumers.
- `npm run test -- --concurrency=1 -- --maxWorkers=1 --minWorkers=1` passed all
  22 tasks: 405 web files / 3,507 tests. Unchanged mobile and shared tasks used
  passing Turbo cache entries. The run crossed an overnight environment delay;
  its reported 10h4m wall-clock duration is not a normal execution benchmark.
  No tests were excluded, timeouts increased, or failures waived.
- `npm run type-check` passed 24 tasks plus root checking; `npm run lint`
  passed with zero errors and the same five existing warnings; `npm run build`
  passed 11 tasks. Changed-file Prettier and `git diff --check` passed.
- The available Calm Haven browser remains at `/login`, so authenticated UI
  and native-device evidence are still pending. No provider setting, factor,
  production data, migration, commit or push was changed.
- Manual review path: Calm Haven, Profile > Security > Enable 2FA or Disable
  2FA. The password/code prompt remains inline, Cancel does not change factors,
  rejected proof is cleared for a new attempt, and pending confirmation blocks
  duplicate submission. The enrollment QR flow and status-refresh recovery
  remain in place. Do not infer authenticated browser or native results from
  the automated component tests.
- Review handoff: Step 4b is implemented. Stop at the configured per-step gate
  before Step 4c (credential qualification and destructive confirmations).
  Audit, check and try-guide gates remain manual. Checkpoint commits are
  optional; no commit was requested for this step.

### Step 4b1 verification (2026-09-12)

- Bulk sign-out is now guarded by `requireSensitiveActionAuth`; the server
  forwards the exact verified token to Supabase's user-JWT logout transport.
  `others` no longer becomes `global`: it preserves the freshly authenticated
  current session and revokes only the user's tracked peers. Peer collection
  includes partially registered sessions and paginates before deleting rows.
- Local sign-out remains independent of step-up and does not fall back to
  user-wide revocation when a token has no session ID. Browser bulk calls never
  bypass a server denial by invoking the SDK's global/others logout directly.
  Legacy global teardown still clears this browser and reports when bulk
  completion could not be confirmed.
- SecurityPanel reuses the shared identity challenge, keeps only one dialog
  open, restores the original confirmation on cancellation, sends the exact
  fresh token, refreshes session queries, and navigates to local teardown only
  after successful global revocation. Ambiguous failures are not auto-replayed.
- Added 19 tests across server, browser transport, revocation persistence,
  installed-SDK HTTP forwarding, SecurityPanel, and goodbye failure handling.
  The first full run passed 3,498 tests but had one unchanged StaffView
  name-sort property test time out after an abnormal 462-second stall. Its
  isolated rerun passed all 30 tests; the name-sort case took 2.7 seconds.
  The final full rerun passed all 22 tasks in 6m11s: 404 web files / 3,499
  tests, including StaffView. The unchanged mobile and shared tasks reused
  passing Turbo cache entries. No exclusions or timeout changes were made.
- `npm run type-check` passed 24 tasks plus root checking; `npm run lint`
  passed with zero errors and the same five existing warnings; `npm run build`
  passed 11 tasks. Changed-file Prettier and `git diff --check` passed.
- Anonymous requests against the running Calm Haven server returned HTTP 401
  for `others` and `global`, and HTTP 200 for local sign-out, as expected.
- Authenticated browser evidence is still pending: the available Calm Haven
  tab is on `/login`. No hosted provider policy was changed or newly qualified.
  This step proves the DubGrid-controlled bulk endpoint and intercepted SDK
  transport, not direct-provider proof-age enforcement. Existing revocation
  propagation/cache limits remain unchanged. Step 4b2 (MFA prompt reuse) and
  Step 4c (credential qualification/destructive confirmations) remain open.
- Review handoff: Step 4b1 is implemented and automatically verified. Stop at
  the configured per-step review gate before Step 4b2. No commit, push,
  deployment, production setting, or provider-policy change was made.

### Step 4a verification (2026-09-12)

- `StepUpDialog` reuses the accessible modal and standard equal-width buttons.
  `useStepUpAction` retains the original callback, prompts only for a structured
  server denial, retries with the exact renewed token, and never automatically
  retries an ambiguous mutation error. Wrong proof, expiry, factor drift,
  cancellation, duplicate submissions, unmount and late timeout results are
  covered. Account or signed-organization changes cancel the pending action.
- `features/account/client/step-up.ts` reuses the guarded password-session
  replacement and live verified-TOTP challenge from Step 3b. Browser context
  snapshots only cancel stale UI work; server assurance remains authoritative.
- The session DELETE route now calls `requireSensitiveActionAuth` before
  session data access, revocation or notification. Its existing CSRF and
  user-ownership scope remain intact. The client forwards the exact proof token
  and uses an abortable deadline. GET and current-device local sign-out remain
  independent of step-up.
- `SessionList` retains the selected device, refreshes session display after
  settlement and keeps the challenge mounted if a background refresh empties
  the list. A focused regression verifies that the typed proof survives that
  refresh and cancellation remains available.
- Final `npm run test -- --concurrency=1 -- --maxWorkers=1 --minWorkers=1`
  passed all 22 tasks in 5m59s: 403 web files / 3,480 tests. The unchanged mobile
  suite (133 files / 1,080 tests) and shared-package tasks used passing Turbo
  cache entries. No exclusions or increased timeouts. The earlier partial run
  was stopped before adding the background-refresh regression, then restarted
  against the corrected source.
- Final `npm run type-check` passed 24 tasks plus root checking;
  `npm run lint` passed with zero errors and the same five existing warnings;
  `npm run build` passed 11 tasks. Changed-file Prettier and `git diff --check`
  passed. Thirty-seven tests were added across hook, transport, route and
  device-list coverage.
- Live browser evidence remains pending: the available Calm Haven tab was on
  login and Chrome refused automation because an extension UI was open. No
  authenticated behavior or native-device outcome is inferred from tests.
  Manual path: Calm Haven, Profile > Security > Devices, Sign out on another
  device with stale proof. Cancel retains the device; correct password or TOTP
  revokes only that device. Current-device sign-out does not prompt for proof.
- Step 4 remains open. Next is Step 4b (bulk session actions and MFA prompt
  reuse), followed by Step 4c (credential qualification and destructive UI).
  Regular audit/check/try policies remain manual. No commit, push, deployment,
  production configuration or provider-policy change was made. Stop here for
  the per-step review gate before continuing with Step 4b.

### Step 3b verification (2026-09-12)

- Both apps now use the shared server MFA lifecycle handler. Enrollment and
  removal run through the canonical sensitive-action guard; cancellation only
  targets live unverified factors. Web retains CSRF checks, and mobile retains
  its bearer, account and organization checks through the standard route layer.
- Password confirmation uses the live account email and preserves the original
  signed organization before installing the new session. A fresh TOTP challenge
  precedes removal. Both clients use the exact promoted token for follow-up
  mutations and server-authoritative status reconciliation.
- Verification in flight or with an unknown timeout outcome cannot trigger
  pending-factor cleanup. Failed writes offer explicit status refresh, without
  replaying verification/removal or presenting an optimistic protection status.
- The installed Supabase SDK was exercised with intercepted HTTP to confirm
  that token-scoped enrollment/removal forward the user's bearer token without
  requiring a stored SDK session. This is transport evidence, not another
  hosted-provider policy test.
- Final `npm run test -- --concurrency=1 -- --maxWorkers=1 --minWorkers=1`
  passed all 22 tasks in 7m48s: 401 web files / 3,443 tests and 133 mobile files /
  1,080 tests, plus the shared-package suites. No exclusions or raised timeouts.
- The first full run caught the two new route-inventory classifications and
  an existing employee-email callback assertion. The inventories were updated
  with guard-wiring coverage. The employee test passed unchanged in both its
  focused rerun and the final full run; no unrelated employee code was edited.
- `npm run type-check` passed all 24 tasks plus root checking. `npm run lint`
  passed with zero errors and five existing warnings. `npm run build` passed
  all 11 tasks. Changed-file formatting and `git diff --check` passed.
- No authenticated browser or native-device verification was performed for
  this substep. Those remain in Step 7 / feature 19e. No hosted configuration,
  production data, migration, commit or push was changed.
- Review handoff: Step 3 is implemented. Step 4 is next, integrating the shared
  web step-up experience with the remaining sensitive actions. Do not proceed
  past this review gate without the user's approval.

### Step 3a verification (2026-09-11)

- `npm run test -- --concurrency=1 -- --maxWorkers=1 --minWorkers=1` passed
  all 22 tasks, with 400 web files / 3,405 tests and 132 mobile files / 1,075
  tests. No tests were excluded and no timeout thresholds were raised.
- The initial default parallel test run failed with mobile worker/setup
  timeouts and seven test failures; the complete single-worker rerun passed.
  Focused MFA and TermsGate tests also passed independently (12 tests).
- `npm run test:mobile -- --concurrency=1 -- --maxWorkers=1 --minWorkers=1`
  passed all 15 tasks using cache from that same verified test run.
- `npm run type-check`, `npm run lint` (zero errors, five existing warnings),
  and `npm run build` passed. Changed-file formatting and `git diff --check`
  passed. No new browser or physical-device evidence was collected for this
  server-only substep.
- Both MFA-status endpoints now ignore the value of a legacy `enabled` field
  and reconcile from a live authenticated user's factors. A malformed factor
  response does not overwrite status. Fresh-challenge flow integration,
  promoted-session handling, and safe cancel/retry remain in Step 3b.
- The provider decision is approved, not blocked. No commit, push, deployment,
  or production configuration change was made for this substep.

### Implementation constraints

- The current `requireFreshAuth` name is misleading: it calls
  `supabase.auth.getUser()` and proves liveness, not recent human authentication.
  Replace or rename it so future callers cannot confuse those guarantees.
- A local Supabase probe during specification confirmed that password sign-in
  produces a password `amr` timestamp and token refresh changes `iat` while
  preserving that timestamp. Keep an integration regression for this property.
- Password reauthentication creates a new Supabase session in the current SDK.
  Update the active web or mobile session atomically, retain its selected
  organization, register its session presence where required, and avoid
  concurrent auth-lock calls.
- TOTP verification returns the promoted AAL2 session. Mobile status persistence
  must continue using `verifiedSession.access_token`, not the AAL1 token captured
  before the challenge.
- Do not use `profiles.mfa_enabled`, client-selected methods, JWT `iat`, browser
  storage, or a successful UI prompt as authority for server execution.
- Keep credentials, TOTP codes, factor secrets, access tokens, and refresh
  tokens out of logs, telemetry, audit details, URLs, error bodies, and tests.
- Preserve the established TOTP issuer and QR behavior. Do not change the
  authenticator label or protocol to solve assurance enforcement.
- Do not describe a preflight endpoint or client modal as a security boundary
  for a public Supabase Auth API. On 2026-09-11 the user approved keeping
  Supabase and limiting the five-minute guarantee to DubGrid-controlled
  endpoints. Direct verified-factor removal requires a provider AAL2 session
  but not fresh proof. See `docs/mfa-provider-boundary.md` for evidence and the
  accepted limitation. Still require a fresh challenge in both app flows.
- A network or provider failure must not fall through to the action. It must
  preserve safe user state and offer an explicit retry or cancel path.
- Do not touch production, rewrite applied migrations, weaken existing
  authorization, or broaden service-role access to make a step-up test pass.
