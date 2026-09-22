# Authentication degraded-network recovery

This document records the request owners, recovery contract, and final
qualification evidence for Blueprint feature 19c3. All runtime qualification
uses local Calm Haven fixtures only.

## Recovery contract

`@dubgrid/client-errors` owns the platform-neutral policy:

- network failures, owned timeouts, HTTP 408, HTTP 429, and HTTP 5xx are
  retryable;
- caller cancellation and terminal HTTP 4xx responses are not retryable;
- automatic recovery allows no more than three retries after the first failed
  request;
- exponential backoff starts at one second and caps at 30 seconds, with jitter
  between 50 and 100 percent of the capped delay;
- a valid `Retry-After` value is never shortened by client backoff;
- concurrent recovery triggers share one underlying attempt, and the guard is
  released after either success or failure;
- automatic replay is for idempotent reads only. Login, MFA, password reset,
  terms acceptance, and other mutations remain manual retries;
- cancellation, sign-out, identity change, organization change, and unmount do
  not consume an outage retry or show a connection error.

The shared policy does not replace request-specific safety budgets. Existing
budgets remain five seconds for web organization bootstrap, eight seconds for
web organization lookup and organization-access status, 12 seconds for mobile
session restoration, and 15 seconds for default web/mobile requests and mobile
session handoff.

## Web baseline

| Journey                           | Request owner                                                                       | Current deadline and retry                     | Current recovery owner                            | Step 1 finding                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization selection            | `DomainSelector` calling `/api/validate-domain` through `fetchWithTimeout`          | 8s, no automatic retry                         | Selector form and manual submit                   | Bounded and preserves the slug; later tests must align classification and double-submit behavior.                                                              |
| Organization and Gridmaster login | `OrgLogin` / `GridmasterLogin` calling `/api/auth/login` through `fetchWithTimeout` | 15s, no automatic retry                        | Login form and manual submit                      | Bounded; later work must normalize retry metadata, non-JSON responses, and single-flight behavior.                                                             |
| MFA and post-MFA preparation      | `MFAVerify` plus `OrgLogin.handleMFAVerified` using browser-auth/account helpers    | No end-to-end app deadline, no automatic retry | MFA/login component                               | A stalled provider or organization-preparation call can hold the handoff. Step 2 owns this gap.                                                                |
| Password-reset request            | Forgot-password page using `resetBrowserPasswordForEmail`                           | No app-owned deadline, no automatic retry      | Forgot-password form                              | Network copy exists, but a stalled provider call can leave the button busy. Step 2 owns this gap.                                                              |
| Reset-link session discovery      | Reset-password page using auth callback/session subscription                        | 15s fallback, no automatic retry               | Reset-password page state                         | The fallback treats every unresolved session as an invalid or expired link. Step 2 must distinguish degraded transport.                                        |
| Password update                   | Reset-password page using `updateBrowserUserPassword`                               | No app-owned deadline, no automatic retry      | Reset-password form                               | A stalled update can keep the button busy. Step 2 owns this gap.                                                                                               |
| Terms acceptance                  | Accept-terms page mutation using `recordCurrentTermsAcceptance`                     | No app-owned deadline, no automatic retry      | `TermsAcceptanceCard`                             | The mutation is manual, but timeout and retry-safe copy need explicit coverage in Step 2.                                                                      |
| Post-login transition             | `OnboardingGate` and `AuthTransitionScreen`                                         | Slow copy at 15s; escape actions at 30s        | Transition screen                                 | The screen is bounded visually, but its retry action only exists when a caller supplies one. Step 2 verifies every handoff owner.                              |
| Organization bootstrap            | `useOrganizationData` calling `/api/organization/bootstrap`                         | 5s per request; up to three query retries      | React Query, then `OrganizationBootstrapRecovery` | Warm cache stays mounted. After the finite query budget, the screen waits for a manual action or one stable reconnect and coalesces concurrent retry triggers. |
| Organization access recheck       | `OrganizationGateScreen` calling `/api/organization/access-status`                  | 8s; 5s polling; query retry disabled           | One React Query poll/manual/reconnect owner       | Polling pauses offline, focus retries are disabled, concurrent triggers share one request, and restored access navigates into the app without a hard refresh.  |

## Mobile baseline

| Journey                                | Request owner                                                        | Current deadline and retry                                | Current recovery owner                              | Step 1 finding                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization lookup and login          | `LoginScreen` using the shared mobile API transport                  | 15s per request, no automatic mutation retry              | Login screen and manual action                      | Bounded, single-flight actions preserve the remembered organization and typed credentials.                                                                             |
| MFA and session handoff                | `verifyMobileTotpFactor` plus `LoginScreen`                          | One 15s provider deadline, no automatic mutation retry    | Login screen                                        | Recoverable failures retain the one-time code, while terminal invalid-code failures clear it. Session persistence and bootstrap warm-up are separately bounded.        |
| Password-reset request                 | `ForgotPasswordScreen` using Supabase Auth                           | 15s provider deadline, no automatic retry                 | Forgot-password screen                              | The email stays in place, repeated taps are coalesced, and the action always releases at its deadline.                                                                 |
| Reset verification, resend, and update | `ResetPasswordScreen` using Supabase Auth                            | 15s per provider action, no automatic retry               | Reset-password screen                               | Verification, resend, update, and session-revocation actions are bounded and preserve safe form state for manual retry.                                                |
| Terms acceptance                       | `TermsGate` calling the mobile API                                   | 15s, no automatic mutation retry                          | Blocking sheet with inline error                    | Acceptance is single-flight and closes from the successful response without waiting on the background bootstrap refresh.                                               |
| Persisted-session restoration          | `AuthSessionProvider` using Supabase Auth                            | 12s per restore attempt, manual retry                     | Session provider and connection recovery screen     | Timeout or transport failure enters explicit recovery without clearing local auth; invalid refresh credentials remain the only restore failure that confirms sign-out. |
| Organization bootstrap                 | `useBootstrap` calling the mobile API                                | 15s per request; up to three query retries                | React Query, then `NetworkConnectionRecoveryScreen` | React Query is the only automatic retry owner, honors `Retry-After`, and retains cached tabs during warm failures. The recovery screen remains a manual escape.        |
| Connectivity probe and reconnect       | `NetworkStateProvider` using `expo-network` and React Query managers | Initial probe capped at 2s; reconnect stabilized for 1.5s | Network provider                                    | A stalled first probe assumes online after its deadline. Repeated online events coalesce, while React Query deduplicates simultaneous reconnect and foreground work.   |
| Organization status while held         | `OrganizationLockedScreen` calling the mobile API                    | 15s; query retry disabled                                 | Locked screen plus bootstrap retry action           | Status remains progressive enhancement. Network recovery does not obscure the safe generic organization gate or add a sign-out path.                                   |
| Startup presentation                   | `StartupSplashGate` observing session, onboarding, and bootstrap     | 900ms minimum; 15s bootstrap display ceiling              | One-way splash latch                                | A paused or unsettled cold bootstrap releases to explicit recovery by its deadline, and the splash cannot return during later refetches.                               |

## Qualification rules

- Tests count underlying request functions, not component renders.
- Fake timers cover only owned deadlines and backoff and are restored after each
  test.
- Browser interception may delay, abort, or return local synthetic responses;
  it must not send outage traffic to staging or production.
- Native evidence uses the Pixel 10 Pro XL Android 17 emulator and Calm Haven.
- Logs and artifacts may contain fixed scenario names, durations, HTTP statuses,
  and counts only. They must not contain credentials, tokens, email, user or
  organization identifiers, bodies, arbitrary URLs, or arbitrary headers.

## Final qualification matrix

| Failure or recovery case             | Web evidence                                                                                                                                                                                                                                  | Mobile evidence                                                                                                                                                                                                              | Result              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Delayed response                     | Calm Haven Chromium journey delays cold organization bootstrap by 1.2s and reaches Dashboard without returning to login. Owned deadline tests cover organization selection, login, account preparation, reset, and terms requests.            | Request-deadline and authentication screen tests cover delayed provider and API work. Startup splash tests prove its 15s display ceiling.                                                                                    | Pass                |
| Caller abort and unmount             | `fetch-with-timeout.test.ts`, `auth-recovery.test.ts`, and the Calm Haven journey distinguish caller aborts from timeout and transport failures. Development remount aborts do not become user-visible failures or consume unbounded retries. | `request-deadline.test.ts`, `AuthSessionProvider.test.tsx`, and `useBootstrap.recovery.test.ts` prove caller cancellation does not sign out or enter outage recovery.                                                        | Pass                |
| Offline and network loss             | Shared recovery classification and web component tests cover offline failures and manual recovery without credential loss.                                                                                                                    | Pixel 10 Pro XL Android 17 emulator: disabling connectivity while Calm Haven was warm preserved the current Home tabs and cached content; restoring connectivity cleared the transient development warning without sign-out. | Pass for warm state |
| Timeout                              | `fetch-with-timeout.test.ts`, account API tests, and login/reset/terms component tests cover owned deadlines and released busy state.                                                                                                         | `request-deadline.test.ts` plus login, forgot-password, reset-password, terms, session restore, bootstrap, and startup tests cover bounded deadlines and recoverable state.                                                  | Pass                |
| HTTP 429 and `Retry-After`           | `@dubgrid/client-errors` and organization API policy tests prove 429 classification, bounded retry, and server delay precedence. Mutation journeys remain manual only.                                                                        | Shared API client, recovery policy, and bootstrap tests prove `Retry-After` is honored without replaying authentication mutations.                                                                                           | Pass                |
| HTTP 5xx                             | Calm Haven Chromium journey exhausts synthetic 503 responses, shows immediate manual actions, stops automatic attempts, then succeeds in place on manual retry with the same path.                                                            | Bootstrap recovery tests cover bounded 5xx retries, retained cached state, and manual recovery.                                                                                                                              | Pass                |
| Successful reconnect or manual retry | Calm Haven Chromium journey receives a final 200 after manual retry, removes recovery UI, and records no page error or unexpected request failure. Organization access tests cover in-place release after restored access.                    | Network-state and bootstrap integration tests prove reconnect plus foreground signals coalesce into one underlying bootstrap attempt; emulator recovery retained the signed-in Calm Haven screen.                            | Pass                |
| Terminal authentication or HTTP 4xx  | Shared policy and web login, MFA, reset, terms, and account tests prove terminal errors are not automatically retried and remain specific enough to act on.                                                                                   | Mobile login, MFA, reset, terms, and session tests prove terminal failures are not replayed; only confirmed invalid refresh credentials sign out.                                                                            | Pass                |

### Native evidence boundary

The installed emulator build is a development client whose JavaScript bundle is
served over the local network. A true cold launch with networking disabled
stopped in the native Metro loader before DubGrid code could execute, so this
run does not claim a cold-offline product-screen observation. Cold-offline
behavior is covered by the mobile provider, bootstrap, splash, and tabs-gate
tests. Warm network loss and reconnect were observed directly on the requested
Android 17 emulator with Calm Haven, and connectivity was restored before the
run ended.

The offline emulator capture also displayed Expo development LogBox output for
the expected realtime channel disconnect. That overlay is development tooling,
not release UI; after reconnect it cleared and the app remained signed in.
