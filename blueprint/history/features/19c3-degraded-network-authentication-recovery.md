# Feature: Degraded-network authentication recovery

**From build-plan:** feature 19c3
**Status:** verified

## Goal

Make every web and mobile authentication entry path recover predictably when
the network is slow, offline, timing out, rate-limited, or temporarily
unavailable. A user must always retain useful already-loaded content or receive
an explicit, safe recovery surface; no request, splash, transition, button, or
gate may remain blank or permanently busy after its deadline.

## In scope

- Cover the authentication and entry states that can prevent a user reaching or
  continuing to use the app:
  - organization lookup and credential submission;
  - password recovery/reset, MFA challenge, and terms acceptance;
  - persisted-session restoration and post-login handoff;
  - organization bootstrap, onboarding/setup decisions, and billing/access
    status rechecks.
- Exercise slow pending work, confirmed offline state, request timeout,
  retryable HTTP responses (`408`, `429`, and `5xx`), captive-portal or
  unexpected non-JSON responses, reconnect, successful retry, and terminal
  authentication/authorization failures on both platforms.
- Reuse and harden the existing web `fetchWithTimeout`,
  `OrganizationBootstrapRecovery`, and `AuthTransitionScreen` paths and the
  existing mobile API timeout, `NetworkStateProvider`, `useTabsGate`, and
  `NetworkConnectionRecoveryScreen` paths.
- Preserve previously loaded, tenant-correct content during warm refetches.
  Full-screen recovery is only for a required cold entry dependency with no
  safe cached content to render.
- Give each outage one retry owner. Automatic retries must have finite attempt
  and per-request budgets, respect offline state and `Retry-After`, prevent
  concurrent duplicates, and leave an enabled manual retry after exhaustion.
  A stable reconnect may begin a new bounded recovery attempt.
- Keep pending feedback accessible and actionable: announce state changes,
  move focus to blocking recovery when appropriate, retain entered values where
  safe, keep action labels on one line, stop busy indicators after deadlines,
  and show client-safe copy without raw provider, billing, tenant, token, URL,
  response-body, or infrastructure details.
- Use Calm Haven for all local browser and native runtime qualification.

## Out of scope

- Cross-tab sign-in/sign-out, token rotation, foreground session refresh, and
  organization-switch races, which belong to 19c4. A reconnect test may prove
  the same identity and organization remain selected, but it must not redesign
  those mechanisms.
- The broader authentication and tenant-security audit in 19d. This feature
  preserves current identity, membership, MFA, terms, billing, onboarding,
  Gridmaster, and tenant checks rather than weakening or caching around them.
- The durable browser/device release matrix and store-build qualification in
  19e.
- General offline-first support for every schedule, people, dashboard, report,
  settings, or mutation request after entry. Only their behavior while shared
  authentication/bootstrap state refreshes is in scope.
- New authentication capabilities, navigation or visual redesign, background
  synchronization, service workers, persistent offline credentials, or a new
  native end-to-end framework.
- Changing the measured authentication performance work from 19c1/19c2 unless
  a recovery defect requires it. Existing 5-second web-bootstrap, 12-second
  mobile session-restore, and 15-second mobile/request-handoff safety budgets
  remain load-bearing until contrary evidence is reviewed.
- Production or staging traffic, provider outage simulation against live
  services, load testing, deployment, or application-store work.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the degraded-network recovery contract** - Inventory the
      current web and mobile entry requests and their actual timeout, retry,
      cancellation, cached-data, and error-classification behavior. Define one
      transport-independent recovery policy in the existing shared client-error
      layer where practical, while keeping platform presentation separate.
      Classify network failure, timeout, `408`, `429`, and `5xx` as retryable;
      keep validation, invalid credentials, MFA, terms, membership, billing,
      onboarding, and other terminal decisions non-retryable unless their
      existing contract explicitly says otherwise. Encode finite automatic
      attempt limits, single-flight behavior, capped exponential backoff with
      jitter, server `Retry-After` handling, and caller-cancellation semantics in
      constants and focused tests. _Done when:_ a checked-in matrix names every
      in-scope request owner and recovery owner; tests prove retryable versus
      terminal classification, finite attempt/deadline behavior, no concurrent
      duplicate, and cancellation that never becomes a misleading network
      failure.
- [x] **Step 2 - Harden signed-out and post-login web recovery** - Apply the
      contract to organization selection, credential login, recovery/reset,
      MFA, terms acceptance, and the post-login transition. A slow request must
      show bounded progress, preserve safe form state, and end in success or an
      enabled retry rather than an indefinite spinner. Offline, timeout, rate
      limit, and temporary server failures get actionable client-safe copy;
      invalid credentials and other terminal responses retain their existing
      specific handling and are not automatically replayed. Prevent duplicate
      submission while one request is active. _Done when:_ focused component
      and route tests cover slow completion before deadline, timeout, offline,
      retry success, automatic-retry exhaustion where applicable, terminal
      failure, and double activation for every web entry action changed; no raw
      technical or organization-state detail reaches the user.
- [x] **Step 3 - Harden authenticated web bootstrap and gate recovery** - Make
      organization bootstrap, onboarding/setup resolution, and organization
      access-status rechecks follow one bounded recovery lifecycle. Keep the
      mounted app and cached organization data visible during warm refetches;
      show `OrganizationBootstrapRecovery` only when no tenant-safe bootstrap
      data exists. Consolidate reconnect/focus/query/screen retries so one outage
      cannot start overlapping fetches. After the automatic budget is exhausted,
      keep manual retry usable; after a stable reconnect, retry promptly and
      release the recovery/locked gate as soon as the server reports access.
      _Done when:_ tests prove cold failure has an explicit recovery surface,
      warm failure retains existing content and navigation state, offline mode
      pauses automatic work, reconnect causes at most one active request,
      manual retry cannot remain latched past its deadline, and a successful
      recheck immediately admits the same user without a hard refresh.
- [x] **Step 4 - Harden signed-out and session-handoff mobile recovery** - Apply
      the same recovery contract to mobile organization lookup, login,
      password-reset OTP, MFA/session handoff, and terms acceptance. Preserve
      the remembered organization and safe input values, keep SecureStore-backed
      restoration pending for the existing valid-session budget, and never turn
      a timeout or connection loss into anonymous state. Busy buttons must
      settle and stay single-line, with an enabled retry after failure and no
      duplicate submission. _Done when:_ focused tests cover slow valid
      completion, offline, timeout, retry success, terminal failure, stale
      completion after cancellation, and repeated taps; valid sessions remain
      signed in and no recovery path leaks provider or tenant details.
- [x] **Step 5 - Harden authenticated mobile bootstrap and reconnect** - Make
      `NetworkStateProvider`, React Query, `useTabsGate`, the startup splash,
      and `NetworkConnectionRecoveryScreen` cooperate as one recovery system.
      Bound the first connectivity probe so launch cannot remain blank, retain
      the mounted tab tree and cached data during warm failures, and use the
      full-screen recovery screen only for a cold bootstrap with no safe data.
      Pause scheduled retries offline; after a stable reconnect or foreground,
      issue at most one bootstrap refetch and release the recovery screen as
      soon as it succeeds. Keep mobile recovery in place with no sign-out action.
      _Done when:_ focused tests prove no blank or permanently latched splash,
      no duplicate reconnect/foreground refetch, bounded automatic attempts,
      usable manual retry after exhaustion, cached-navigation preservation, and
      successful in-place recovery without logout.
- [x] **Step 6 - Qualify the cross-platform failure matrix** - Run deterministic
      delayed, aborted, offline, timeout, `429`/`Retry-After`, `5xx`, recovery,
      and terminal-error cases across the changed web and mobile paths. Use
      Playwright request interception for Calm Haven web journeys and the same
      Pixel 10 Pro XL Android 17 emulator used for 19c2 for native airplane-mode
      or network-loss/reconnect checks where the local environment supports it.
      Inspect browser console/network output and native logs, then document the
      observed recovery timing, retry counts, retained-content behavior, and
      unavailable evidence. _Done when:_ every matrix row has automated or
      disclosed manual evidence; no path is blank, permanently busy, repeatedly
      retrying after its budget, unexpectedly logged out, or showing stale data
      from another identity/organization; the full applicable web/mobile tests,
      type check, lint, and production build pass.

## Files / areas

- `packages/client-errors/` and `packages/api-client/` for shared,
  transport-independent classification or retry metadata only when that avoids
  duplicated policy.
- `apps/web/src/lib/fetch-with-timeout.ts`, client-facing error helpers, and
  focused tests.
- Web organization selector/login, forgot/reset-password, MFA, terms, billing
  gate, auth transition, and their component/route tests.
- `apps/web/src/hooks/useOrganizationData.ts`,
  `apps/web/src/features/organization/client/api.ts`,
  `apps/web/src/components/onboarding/OnboardingGate.tsx`, and
  `OrganizationBootstrapRecovery.tsx` with focused tests.
- `apps/mobile/src/shared/lib/api.ts`, mobile client-error helpers,
  `AuthSessionProvider.tsx`, `NetworkStateProvider.tsx`, and their tests.
- Mobile `LoginScreen`, forgot/reset-password, MFA/terms gates,
  `useBootstrap`, `useTabsGate`, `StartupSplashGate`, and
  `NetworkConnectionRecoveryScreen` with focused tests.
- Existing Playwright authentication helpers/specs and a focused operations
  note under `docs/operations/`.

## Data / contracts

- No database schema or migration is expected.
- Existing request/response shapes, URLs, cookies, session storage, SecureStore
  storage, React Query keys, and role/entry-gate decisions remain compatible.
- The verified current session and effective organization remain the authority.
  Cached content may stay visible only when it belongs to that same identity and
  organization; recovery cannot reuse or display data after either key changes.
- Automatic retries are limited to idempotent reads and explicitly safe
  operations. Credential login, MFA verification, password-reset submission,
  terms acceptance, and other mutations are never replayed automatically unless
  their existing idempotency contract proves it safe; the user receives a
  manual retry instead.
- Caller cancellation, sign-out, identity change, organization change, and
  unmount remain distinct from timeout. They must abort stale work silently and
  must not increment an outage retry budget or surface a connection error.
- Retry state is an in-memory client concern, reset by success or a new stable
  reconnect epoch. It is not persisted to Supabase, cookies, local storage, or
  SecureStore.
- Rate-limit responses must honor valid `Retry-After` guidance and never retry
  earlier. Invalid or missing guidance falls back to the documented capped
  backoff.
- Recovery telemetry, tests, and documentation may record fixed scenario names,
  durations, statuses, and counts only; never credentials, tokens, email, user
  ids, organization ids, request bodies, or arbitrary URLs/headers.

## Testing

- Unit-test shared recovery classification, retry-delay calculation,
  cancellation, finite attempt budgets, single-flight guards, valid and
  malformed `Retry-After` handling, and unexpected non-JSON responses.
- Web component/route tests must cover every changed entry action plus cold and
  warm organization bootstrap, including cached-content preservation and
  immediate release after a successful access-status recheck.
- Mobile tests must cover session restoration, organization lookup/login,
  password reset/MFA/terms actions, cold and warm bootstrap, first network probe,
  reconnect stability, foreground interaction, and startup-splash release.
- Use fake timers only around owned deadlines/backoff and always restore them.
  Assert underlying request counts, not render counts or hook invocations.
- Playwright-test a Calm Haven cold login and authenticated refresh under delayed
  and failed bootstrap responses, then recovery without page reload. Check the
  browser console and failed-request list.
- Manually exercise Calm Haven on the Pixel 10 Pro XL Android 17 emulator by
  losing and restoring connectivity during cold login, warm restoration, and an
  authenticated bootstrap refetch. Record what is directly observed and disclose
  any native network state that cannot be controlled honestly.
- Final verification commands: focused Vitest targets, `npm run test:web`,
  `npm run test:mobile`, `npm run type-check`, `npm run lint`, `npm run build`,
  and the relevant `npm run test:e2e` target. Do not send traffic to staging or
  production.

## Notes for the AI

- Start by measuring and inventorying current behavior. Existing recovery
  primitives already cover important cases; retain them and repair demonstrated
  gaps instead of replacing them wholesale.
- Treat "bounded" as all of: a deadline for each request, a finite automatic
  attempt count, capped client backoff, no concurrent duplicate, and a manual
  escape after exhaustion. Do not solve a permanent loading state with an
  infinite background loop.
- React Query can already retry on mount, reconnect, focus, and explicit
  refetch. Count the actual query-function/network calls before adding another
  owner, and disable only the overlapping trigger proven redundant.
- Do not replace useful warm content with a blocking recovery screen, splash,
  onboarding wizard, or login page. Background errors may be surfaced
  non-destructively while cached content stays mounted.
- Do not mistake `AbortError`, user navigation, or a stale identity/org
  cancellation for a network failure. Conversely, translate an owned deadline
  into an explicit timeout so it cannot be swallowed as generic cancellation.
- Keep mobile users signed in during recoverable failures. Mobile bootstrap
  recovery stays in place and never offers sign-out; only a verified terminal
  authentication failure may clear the session through the existing auth-reset
  owner.
- Preserve the intentional separation between ordinary workspace loading,
  onboarding preparation, billing/organization unavailability, and network
  recovery. Never expose the technical or billing reason for an organization
  hold to regular users or admins.
- Use full role names in user-facing print/output; this feature does not change
  the existing abbreviation rules.
