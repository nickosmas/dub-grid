# Web authentication entry performance

## Repeat the local measurement

Run this from the repository root with local Supabase running and the standard
seed data available:

```sh
npm run measure:auth:web
```

The command starts an isolated Next.js development server on port 3101 with
performance timing enabled, then runs three Chromium samples against Calm Haven.
It first uses the dedicated seeded QA account for an unmeasured preparation
login so one-time Terms, onboarding, and welcome surfaces do not contaminate the
results. Each measured pair uses a new browser context:

- `cold_sign_in` starts immediately before submitting the signed-out Calm Haven
  login form and ends when authenticated navigation is usable and organization
  bootstrap has completed.
- `warm_refresh` starts immediately before a hard refresh of that authenticated
  destination and ends at the same readiness point.

Set `AUTH_ENTRY_SAMPLES` to an integer from 1 through 5 to change the bounded
sample count. The default stays below the local login limiter. The command emits
an `AUTH_ENTRY_BASELINE` JSON block and attaches the same JSON to the Playwright
result. Output contains only fixed request labels, allowlisted timing-stage
names, counts, and durations. It never includes URLs, query values, email
addresses, passwords, tokens, user ids, or organization ids.

If the seeded QA account is unavailable, restore the standard local seed before
measuring. `npm run db:reset` deletes and rebuilds local data, so do not run it
without first confirming that local changes can be discarded.

## Baseline recorded 2026-09-08

Environment: Next.js development server, local Supabase, Chromium, Calm Haven,
three samples after one unmeasured account-preparation login. P95 below is the
nearest-rank tail observation from only three local samples, not a statistically
stable production percentile.

| Journey      | Measurement                     |     Median |  P95 / max |
| ------------ | ------------------------------- | ---------: | ---------: |
| Cold sign-in | End to usable                   | 1,330.1 ms | 1,842.3 ms |
| Cold sign-in | Login authentication            |    85.9 ms |   107.0 ms |
| Cold sign-in | Organization bootstrap total    |   778.4 ms | 1,163.1 ms |
| Cold sign-in | Bootstrap configuration fan-out |   495.6 ms |   859.3 ms |
| Warm refresh | End to usable                   | 1,332.3 ms | 1,536.2 ms |
| Warm refresh | Organization bootstrap total    |   513.6 ms |   691.5 ms |
| Warm refresh | Bootstrap configuration fan-out |   459.5 ms |   494.7 ms |
| Warm refresh | Proxy organization-access check |     0.0 ms |   365.5 ms |

Tracked entry requests were bounded at one per journey for browser user
verification, protected navigation, organization context, organization
bootstrap, and permissions. Cold sign-in also made exactly one login request.

The baseline confirmed one avoidable duplication candidate: warm refresh made a
median of two session-tracking requests and a maximum of three. The performance
repair steps should trace that lifecycle before changing it, then prove that one
authenticated entry records the session no more than once without weakening
the registry. The separate organization-context, permissions, and bootstrap
requests run concurrently; this baseline alone does not prove that combining
their security boundaries would be safe. Bootstrap configuration fan-out is the
largest measured server phase and should be investigated against cache state
before any optimization is proposed.

Both journeys remain below the existing operational alert thresholds of 5
seconds P95 for login and 8 seconds P95 for organization bootstrap. Those
production thresholds are guardrails, not performance targets, and the local
sample does not replace production monitoring.

## Step 2 server-path assessment

A second three-sample Calm Haven run traced the server path before any repair.
Warm bootstrap total fell to a 407.1 ms median, proxy organization access was a
0 ms median and maximum, and the already-concurrent configuration phase remained
variable at a 366.5 ms median and 502.8 ms maximum. Redis is configured in this
local environment, so the repeat represents the configured cache path rather
than the cache-disabled fallback.

No server-side code was changed in Step 2. The bootstrap already verifies the
request once and passes that verified actor into organization authorization;
configuration, employee count, member onboarding, and administrator onboarding
queries already start concurrently; and the proxy access result is already
cached. Increasing the 30-second aggregate configuration TTL would not remove
the measured Redis lookup from each request, while it would extend the window
for stale organization configuration. Combining the separately authorized
organization-context, permissions, and bootstrap endpoints would also change
security boundaries without evidence that doing so is safe.

The confirmed avoidable work remains the browser-originated session-registration
duplication: the repeat made one session-tracking request during cold sign-in and
three during every warm refresh. Step 3 owns that repair. A bootstrap route test
now locks in the single authentication call and verified-actor reuse so that the
server path cannot silently regain the earlier duplicate identity verification.

## Final qualification

The same three-sample Calm Haven command was run after the browser repair. The
functional login suite separately exercised regular user, admin, super admin,
and Gridmaster role outcomes without using personal accounts or changing local
membership data.

| Journey      | Measurement                   | Baseline median | Final median | Baseline P95 |  Final P95 |
| ------------ | ----------------------------- | --------------: | -----------: | -----------: | ---------: |
| Cold sign-in | End to usable                 |      1,330.1 ms |   1,854.5 ms |   1,842.3 ms | 2,429.7 ms |
| Warm refresh | End to usable                 |      1,332.3 ms |     979.6 ms |   1,536.2 ms | 1,071.4 ms |
| Warm refresh | Session-registration requests |               2 |            1 |            3 |          1 |

Warm entry improved by 26.5% at the median and 30.3% at the three-sample tail,
while its confirmed duplicate session-registration work fell from a median of
two and maximum of three requests to exactly one in every sample. Login, browser
user verification, protected navigation, organization context, organization
bootstrap, and permissions also remained bounded at one request per applicable
journey.

Cold timing did not reproduce the first run's faster remote-cache observation.
Its configuration phase was 827.5 ms in the final run versus 495.6 ms in the
original baseline. An immediate pre-repair control run under the same cache
conditions measured 1,841.3 ms cold versus 1,854.5 ms after the repair, a 13.2 ms
difference within this small local sample's normal variation. Session
registration is fire-and-forget and is not part of the readiness condition, so
the browser change does not explain the remote configuration-cache variance.
Both final journeys remain within the existing operational guardrails.
