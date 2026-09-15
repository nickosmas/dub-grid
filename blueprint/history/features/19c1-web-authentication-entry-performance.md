# Feature: Web authentication entry performance

**From build-plan:** feature 19c1
**Status:** verified

## Goal

Make cold sign-in and warm authenticated entry on the web measurably faster and
more predictable. Establish a repeatable baseline across the login, proxy,
browser session verification, organization context, and organization bootstrap
path, then remove only bottlenecks that the evidence confirms without weakening
identity verification, live organization access, tenant isolation, or entry
gates.

## In scope

- Measure two representative web entry journeys:
  - cold entry from a signed-out organization login to a usable authenticated
    destination;
  - warm entry from an existing valid session through a hard refresh to usable
    authenticated content.
- Record end-to-end duration, meaningful server timing spans, and request counts
  for login, browser session verification, protected-route proxy work,
  organization context, and organization bootstrap.
- Cover regular user, admin, and super admin organization access in functional
  regression tests. Include Gridmaster entry where an optimization touches a
  shared login or proxy path.
- Reuse and extend the existing `Server-Timing`, Playwright, Vitest, and safe
  local measurement infrastructure instead of introducing a separate tracing
  system.
- Remove confirmed duplicate requests, unnecessary serial dependencies, or
  avoidable repeated server work on the measured entry paths.
- Preserve useful authenticated page content during an ordinary warm refresh;
  do not replace it with a full-screen transition unless a real entry gate
  requires one.
- Document the before-and-after evidence, the retained security boundaries, and
  how to repeat the measurements.

## Out of scope

- Mobile session restoration and bootstrap performance, covered by 19c2.
- Slow, offline, timeout, retry, and recovery-state behavior, covered by 19c3.
- Cross-tab authentication changes, token rotation, foreground/resume, and
  organization-switch races, covered by 19c4.
- The broader authentication security audit and hardening work in 19d. Security
  behavior exercised by this feature is preserved, not redesigned.
- Browser and device matrix qualification in 19e.
- Production alert configuration, deployment, or production load testing.
- The documented 1,000-sign-ins-per-minute staging test. Running traffic against
  staging requires separate authorization and appropriate test accounts.
- Changes made only to improve a synthetic score when they do not improve the
  measured user journeys.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Establish a repeatable web entry baseline** - Add the smallest
      safe local measurement harness needed to capture cold sign-in and warm
      authenticated refresh duration, request counts, and existing server timing
      spans. Record the environment, scenario, sample method, and results without
      logging passwords, tokens, email addresses, user ids, or organization ids.
      The harness must distinguish the measured phases closely enough to identify
      whether delay is in login, browser verification, proxy work, organization
      context, or bootstrap. _Done when:_ one documented local command produces a
      comparable result for both journeys, the baseline identifies any confirmed
      duplicate or serial work, and focused tests prove that diagnostic output
      remains opt-in and contains no account or tenant data.
- [x] **Step 2 - Repair confirmed server entry bottlenecks** - Use the Step 1
      evidence to remove only confirmed avoidable work in the login route,
      protected-route proxy, organization resolution, permission check, or
      organization bootstrap. Preserve CSRF validation, rate limits, verified
      identity, current membership and organization access checks, billing and
      onboarding entry gates, MFA and terms routing, sandbox ownership, and
      impersonation verification. If the baseline finds no safe server-side
      repair, leave the server path unchanged and record that result. _Done when:_
      route and proxy tests prove the same authorization and response outcomes,
      call-count or ordering tests cover each changed dependency, and the local
      measurement shows the targeted duplicate or serial work is gone without a
      regression in either journey.
- [x] **Step 3 - Repair confirmed browser entry duplication** - Use the baseline
      to remove only confirmed redundant browser session verification,
      organization-context, or organization-bootstrap requests across concurrent
      consumers such as the authentication provider, shell, header, onboarding
      gate, permissions, and page hooks. Keep session and user verification
      sequencing compatible with Supabase Web Locks, cancel stale organization
      bootstrap work on identity or organization change, and retain normal page
      content during warm refresh. If the baseline finds no safe client-side
      repair, leave this path unchanged and record that result. _Done when:_
      focused tests demonstrate bounded underlying auth and bootstrap calls when
      concurrent consumers mount, no stale response can populate a changed
      session or organization, and both measured journeys show no regression.
- [x] **Step 4 - Qualify and document the result** - Rerun the same cold and warm
      measurements, compare them with the baseline, and document the request-count
      and phase-timing change. Exercise organization login for regular user,
      admin, and super admin roles, plus any Gridmaster path affected by the diff.
      Run the focused web tests, web test suite, type check, lint, build, and the
      relevant Playwright entry checks. _Done when:_ the before-and-after report
      is reproducible, all applicable checks pass, no measured phase or request
      count regresses without an explained security requirement, and the result
      remains inside the existing operational alert thresholds of 5 seconds P95
      for login and 8 seconds P95 for bootstrap where the local environment can
      validly exercise those thresholds.

## Files / areas

- `apps/web/src/app/api/auth/login/` and its route tests.
- `apps/web/src/proxy.ts` and proxy tests.
- `apps/web/src/lib/server-timing.ts` and timing tests.
- `apps/web/src/lib/browser-auth.ts` and browser-auth tests.
- `apps/web/src/components/AuthProvider.tsx` and focused provider tests.
- `apps/web/src/hooks/useOrganizationData.ts` and organization-data tests.
- `apps/web/src/features/organization/client/`.
- `apps/web/src/app/api/organization/bootstrap/` and its route tests.
- `e2e/login.spec.ts` and shared authentication helpers.
- `load-tests/` only if its local smoke path can be reused safely without
  weakening rate-limit coverage or requiring remote traffic.
- `docs/operations/auth-resilience.md` or a focused companion document for the
  repeatable baseline and before-and-after result.

## Data / contracts

- No database schema or migration is expected.
- Existing login, proxy, session, organization-context, and bootstrap response
  shapes remain compatible unless a separately reviewed need is proven.
- Security checks and their ordering are load-bearing contracts. An optimization
  may parallelize independent work, but it must not cache, bypass, or defer a
  request-scoped identity, membership, tenant, MFA, billing, onboarding, sandbox,
  impersonation, CSRF, or rate-limit decision.
- `Server-Timing` remains opt-in through `PERF_TIMING=1`. Diagnostic names may be
  extended, but headers, logs, test artifacts, and documentation must not contain
  secrets or identify a user or organization.
- The existing production alert thresholds are operational guardrails, not a
  license to accept an avoidable local regression below those values.

## Testing

- Unit-test timer serialization, opt-in behavior, sanitization, and any new
  measurement parsing or comparison logic.
- Route-test unchanged login outcomes for success, invalid credentials, rate
  limiting, MFA, terms acceptance, organization switching, Gridmaster routing,
  and relevant service failures. Add dependency call-count and ordering
  assertions for optimized work.
- Route-test unchanged bootstrap authorization, live membership, billing and
  onboarding entry gates, sandbox and impersonation resolution, cache boundaries,
  deadline handling, and successful fan-out. Assert that authenticated actor
  verification and other changed dependencies run only as often as intended.
- Test browser auth deduplication and Web Locks recovery without converting a
  slow valid session into logout. Test any organization-context or bootstrap
  consolidation under concurrent consumers and cancellation on context change.
- Playwright-test cold organization login and warm authenticated hard refresh.
  Confirm the user reaches usable content, no unexpected login or transition
  screen appears, and the measured request counts stay within the documented
  bounds.
- Manually inspect browser Network timing with `PERF_TIMING=1` for the measured
  paths and confirm the documented phases match the actual requests.
- Final verification commands: `npm run test:web`, `npm run type-check`,
  `npm run lint`, `npm run build`, and the relevant `npm run test:e2e` target.
  Do not run the staging load test without separate approval.

## Notes for the AI

- Measure before changing behavior. Do not infer a bottleneck from code shape
  alone, and do not manufacture an optimization when the baseline shows none.
- Compare like with like: use the same local runtime, data fixture, cache state,
  role, route, and sample method before and after each repair. Report medians and
  tail observations rather than presenting one run as representative.
- Count underlying network or SDK calls, not merely React hook invocations.
- Keep React Query keys and effective organization identity tenant-safe. A cache
  shared between consumers must never be shared between authenticated identities
  or effective organizations.
- Preserve the deliberate sequential `getSession` then `getUser` behavior where
  parallel Supabase calls would contend for the same browser auth lock.
- Treat ordinary authenticated refresh and post-login handoff as distinct user
  journeys. Optimize both without reintroducing an onboarding or transition
  screen after the user has already entered the app.
- Keep measurements local and low volume. Never point a harness at production,
  and never generate staging traffic without explicit approval.
