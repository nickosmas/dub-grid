# Feature: Mobile authentication entry performance

**From build-plan:** feature 19c2
**Status:** verified

## Goal

Make cold sign-in and warm authenticated entry in the mobile app measurably
faster and more predictable. Establish a repeatable baseline across credential
login, persisted-session restoration, session handoff, organization bootstrap,
and the startup gate, then remove only bottlenecks confirmed by that evidence
without treating slow restoration as logout or weakening authentication and
tenant checks.

## In scope

- Measure two representative mobile entry journeys against Calm Haven:
  - cold entry from submitting valid credentials to the first actionable
    authenticated screen;
  - warm entry from the first JavaScript startup marker with a valid persisted
    session to the first actionable authenticated screen.
- State explicitly that the warm measurement begins when the JavaScript runtime
  starts and does not claim to include native binary launch time before that
  marker.
- Record end-to-end duration, allowlisted phase timings, and request counts for
  credential login, persisted-session restoration, Supabase session handoff,
  mobile session-presence registration, organization bootstrap, startup-gate
  release, and authenticated navigation.
- Use a local iOS simulator or Android emulator and a dedicated seeded Calm
  Haven quality-assurance account. Keep measurements opt-in and low volume.
- Reuse the existing mobile API transport, React Query bootstrap cache,
  `Server-Timing` support, Expo logging, and local scripts where practical
  instead of introducing a native end-to-end framework solely for this feature.
- Remove confirmed duplicate requests, unnecessary serial work, or avoidable
  waits in the mobile client and the mobile login/bootstrap server paths.
- Cover regular user, admin, and super admin access outcomes in functional
  regression tests. Preserve the deliberate rejection of Gridmaster accounts
  on mobile.
- Document the before-and-after evidence, retained security boundaries,
  measurement limitations, and exact reproduction steps.

## Out of scope

- Native process startup before the JavaScript runtime begins, app-store build
  launch profiling, and a full iOS/Android device matrix. Those require native
  release qualification in 19e.
- Slow, offline, timeout, retry, and recovery-state redesign, covered by 19c3.
- Foreground/resume, token rotation, cross-session changes, and organization
  switching, covered by 19c4.
- Migrating every authenticated React Query key away from raw rotating tokens,
  tracked separately as finding F-30. Bootstrap already uses the stable user and
  organization identity required by this feature.
- The broader authentication security audit and hardening work in 19d. Security
  behavior exercised here is preserved, not redesigned.
- New authentication capabilities, navigation redesign, splash redesign, or
  reducing the intentional minimum splash duration only to improve a synthetic
  result.
- Production or staging traffic, load testing, production alert configuration,
  EAS changes, native project regeneration, or application-store deployment.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Establish a repeatable mobile entry baseline** - Add the
      smallest safe, development-only instrumentation needed to capture cold
      credential sign-in and warm persisted-session entry from the first
      JavaScript marker to usable authenticated content. Count the underlying
      login, bootstrap, and session-presence requests, and capture allowlisted
      client and server phases without recording credentials, tokens, email
      addresses, user ids, organization ids, request bodies, or arbitrary URLs
      and headers. Run at least three comparable samples for each journey on one
      documented local simulator or emulator against Calm Haven. _Done when:_ a
      documented local procedure produces sanitized median, P95, maximum, phase,
      and request-count output for both journeys; the starting and usable-content
      markers are precisely defined; and focused tests prove instrumentation is
      opt-in, bounded, and unable to emit account or tenant data.
- [x] **Step 2 - Repair confirmed server entry bottlenecks** - Use the Step 1
      evidence to remove only confirmed avoidable work in the mobile credential
      login route, token verification, live revocation and membership checks,
      organization resolution, permission construction, setup and billing gates,
      or bootstrap fan-out. Preserve rate limiting, verified identity, MFA
      assurance, active membership, token-bound organization context, inactive
      employee restrictions, terms state, tenant isolation, and Gridmaster
      rejection. If no safe server repair is supported by the measurements,
      leave production behavior unchanged and document that result. _Done when:_
      route and package tests prove unchanged authorization and response
      outcomes, call-count or ordering tests cover each changed dependency, and
      the measured server phase improves or remains unchanged within normal
      variation.
- [x] **Step 3 - Repair confirmed mobile handoff duplication** - Use the
      baseline to remove only confirmed redundant work across `LoginScreen`,
      `AuthSessionProvider`, the React Query bootstrap consumers, and
      `StartupSplashGate`. In particular, verify whether session-presence
      registration or bootstrap runs more than once before consolidating it.
      Preserve SecureStore-backed Supabase restoration, stale-restore rejection,
      cancellation on identity or organization change, the stable
      user-and-organization bootstrap key, the one-way startup-splash latch, and
      existing recovery ownership. Do not shorten the 12-second restore or
      15-second request and handoff safety budgets without separate evidence for
      slow valid sessions. _Done when:_ focused tests bound the underlying
      session restoration, presence, and bootstrap calls; a slow valid session
      cannot become anonymous merely because it is slow; and both measured
      journeys show no unexplained regression.
- [x] **Step 4 - Qualify and document the result** - Rerun the same Calm Haven
      cold and warm samples on the same local simulator or emulator, compare
      them with the baseline, and document every request-count and phase-timing
      change. Exercise regular user, admin, and super admin organization-entry
      outcomes plus mobile Gridmaster rejection in automated coverage. Run the
      focused mobile and mobile-route tests, full mobile and web suites where
      shared server code changed, type checks, lint, and production build.
      _Done when:_ the report is reproducible; all applicable checks pass; no
      measured phase or request count regresses without an explained security
      requirement; the result remains inside the existing 5-second P95 login and
      8-second P95 bootstrap operational thresholds where the local environment
      can validly exercise them; and unavailable native platform evidence is
      disclosed rather than inferred.

## Files / areas

- `apps/mobile/src/shared/providers/AuthSessionProvider.tsx` and its tests.
- `apps/mobile/src/features/auth/screens/LoginScreen.tsx` and its tests.
- `apps/mobile/src/features/auth/hooks/useBootstrap.ts`, `useTabsGate.tsx`, and
  focused tests.
- `apps/mobile/src/shared/components/StartupSplashGate.tsx` and its tests.
- `apps/mobile/src/shared/lib/api.ts`, `query-client.ts`, and focused tests.
- `apps/web/src/features/mobile/server/routes/auth-login.ts`, `bootstrap.ts`,
  and their route tests.
- `apps/web/src/features/mobile/server/auth.ts` and focused authentication tests.
- `packages/mobile-api-core/src/auth.ts`, `read.ts`, and their tests if measured
  server work is changed.
- A focused local measurement helper or script and
  `docs/operations/mobile-auth-entry-performance.md`.
- Mobile environment documentation only if an opt-in variable is required;
  never store a credential or token in a tracked file.

## Data / contracts

- No database schema or migration is expected.
- Existing mobile login and bootstrap request and response shapes remain
  compatible unless a separately reviewed need is proven.
- The access token remains the server-side authority for effective organization
  context. Measurement and optimization may not trust a client-provided
  organization id or reuse bootstrap data across user or organization claims.
- Identity verification, revocation, MFA, live membership, billing, setup,
  inactive-employee, terms, and Gridmaster decisions are load-bearing entry
  contracts. Independent work may run concurrently only when doing so cannot
  change observable authorization outcomes or leak organization existence.
- Diagnostics use fixed journey, phase, and request-kind allowlists. They remain
  disabled by default and may emit durations and counts only, never secrets or
  account and tenant identifiers.
- Existing 12-second session restoration and 15-second mobile request and
  session-handoff deadlines are safety budgets. They are not performance
  targets and must not be tightened merely to make measurements finish sooner.
- The 900-millisecond minimum launch splash is an intentional presentation
  contract. Measure it honestly and change it only if product direction changes,
  not as an inferred performance optimization.

## Testing

- Unit-test diagnostic opt-in behavior, allowlists, sanitization, aggregation,
  and any phase parsing or comparison logic.
- Test `AuthSessionProvider` call counts and outcomes for a stored valid session,
  auth-state replay, a slow restore, invalid refresh credentials, and stale
  completion after the restore budget.
- Test `LoginScreen` handoff call counts and ordering across login, `setSession`,
  presence registration, bootstrap warm-up, and navigation. Retain MFA handoff
  behavior and the existing failure recovery state.
- Test bootstrap React Query deduplication and cancellation across the startup
  gate and concurrent consumers without sharing cache data across user or
  organization claims.
- Route-test regular user, admin, and super admin mobile login and bootstrap
  outcomes, plus Gridmaster rejection, rate limiting, MFA, live membership,
  organization claim, billing, setup, inactive employee, terms, and service
  failures. Add dependency call-count and ordering assertions for optimized
  server work.
- Run the documented measurement on Calm Haven with at least three cold and
  three warm samples using the same local build, runtime, simulator or emulator,
  account, and cache method before and after each repair. Record median, P95,
  maximum, phase durations, and request counts.
- Final verification commands: focused Vitest targets,
  `npm --workspace @dubgrid/mobile run test`, `npm run test:mobile`,
  `npm run test:web`, `npm run type-check`, `npm run lint`, and `npm run build`.
  Do not run remote load tests or send traffic to staging or production.

## Notes for the AI

- Measure before changing behavior. Do not infer a bottleneck from code shape,
  including the two current session-presence call sites, until request counts
  confirm what reaches the network.
- Compare like with like: use the same Calm Haven fixture, local server, mobile
  build, runtime, platform, account, cache state, and sample procedure before and
  after a repair. Report medians and tail observations rather than presenting a
  single run as representative.
- Count underlying network and Supabase SDK calls, not hook renders or function
  invocations.
- Keep measurement instrumentation out of ordinary production behavior and
  never print the raw diagnostic input before sanitization.
- A warm launch measurement begins at the first JavaScript marker. Do not label
  it full native cold-start time or compare it with a platform-native launch
  trace.
- Preserve the deliberate login order where later operations depend on a token,
  verified user, target membership, or refreshed organization claim. Parallelize
  only dependencies proven independent and security-equivalent.
- Keep F-30's broader authenticated-query-key migration and 19c4's token and
  organization-switch races out of this feature. Bootstrap's existing stable
  `(sub, org_id)` key and cancellation behavior remain load-bearing.
- If the available local environment cannot produce honest simulator or emulator
  evidence, stop and report the missing evidence rather than substituting web or
  unit-test timing.
