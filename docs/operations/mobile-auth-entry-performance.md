# Mobile authentication entry performance

This procedure measures development-only mobile authentication entry against the
local Calm Haven fixture. It does not send measurement traffic to staging or
production, and it does not measure native binary launch before JavaScript
starts.

## What the markers mean

- `cold_sign_in` begins immediately before the credential-login request after a
  valid Sign In press. It ends on the first animation frame after bootstrap has
  settled and navigation to the authenticated Home route is dispatched.
- `warm_restore` begins when the root JavaScript module is evaluated. It ends
  once both the one-way startup gate and the authenticated tab layout are ready.
  Native process startup before JavaScript evaluation is outside this number.
- Request phases are accumulated client request durations. `startup_gate` and
  `authenticated_navigation` are elapsed markers from the journey start, not
  mutually exclusive spans.
- Server phases come only from fixed `Server-Timing` names on the mobile login
  and bootstrap routes. Unrecognized names and all descriptions are discarded.

The emitted schema contains only the fixed journey, phase, and request names
plus numeric durations and counts. It has no fields capable of carrying a
credential, token, email address, person or organization identifier, request
body, URL, header, or arbitrary diagnostic value. Measurement is enabled only
when both the Expo development build and
`EXPO_PUBLIC_AUTH_ENTRY_MEASUREMENT=1` are present. The in-memory buffer retains
at most 12 samples.

## Reproduce locally

Use one local Android emulator or iOS simulator for the whole comparison. The
baseline below used the Pixel 10 Pro XL Android emulator on Android 17, the
Expo development build, local Supabase, the local Next.js server, and the
dedicated seeded QA super-admin membership in Calm Haven.

1. Start the local web API with server timing enabled:

   ```sh
   PERF_TIMING=1 npm run dev:web:lan
   ```

2. In another terminal, start mobile measurement. Filter before writing so the
   saved file contains only sanitized measurement records:

   ```sh
   EXPO_PUBLIC_AUTH_ENTRY_MEASUREMENT=1 npx expo start --android 2>&1 \
     | rg --line-buffered '\[dubgrid-auth-entry\]' \
     > /tmp/dubgrid-mobile-auth-entry.log
   ```

3. Select Calm Haven and use the dedicated seeded QA account. For each cold
   sample, sign out from Profile first; that path clears the React Query cache.
   Submit valid credentials and wait for Home to become usable. Repeat three
   times without changing the server, build, account, emulator, or network.
4. While signed in to Calm Haven, fully stop and relaunch the app for each warm
   sample. Do not use Fast Refresh as a launch substitute. Repeat three times.
5. Summarize the sanitized records:

   ```sh
   npm run measure:auth:mobile -- /tmp/dubgrid-mobile-auth-entry.log
   ```

The summarizer ignores non-measurement lines, rejects unknown fields or names,
and prints median, P95, maximum, median phase durations, and median request
counts for each journey.

## Baseline before repairs

Captured on September 8, 2026 with three samples per journey using the setup
above:

| Journey      |     Median |        P95 |    Maximum | Login requests | Bootstrap requests | Presence requests |
| ------------ | ---------: | ---------: | ---------: | -------------: | -----------------: | ----------------: |
| Cold sign-in | 2,018.5 ms | 2,313.1 ms | 2,313.1 ms |              1 |                  1 |                 2 |
| Warm restore | 2,139.0 ms | 2,221.7 ms | 2,221.7 ms |              0 |                  1 |                 1 |

Median client phases:

| Journey      |  Restore |    Login |  Handoff | Bootstrap |   Presence | Startup gate | Authenticated navigation |
| ------------ | -------: | -------: | -------: | --------: | ---------: | -----------: | -----------------------: |
| Cold sign-in |        - | 811.7 ms | 174.3 ms |  848.3 ms | 1,443.2 ms |   1,973.2 ms |               2,018.5 ms |
| Warm restore | 155.7 ms |        - |        - |  998.9 ms | 1,058.8 ms |   1,841.8 ms |               2,137.9 ms |

Median server phases:

| Journey      | Login total | Login rate limit | Login flow | Bootstrap total | Bootstrap auth | Bootstrap fan-out |
| ------------ | ----------: | ---------------: | ---------: | --------------: | -------------: | ----------------: |
| Cold sign-in |    226.2 ms |           7.7 ms |   212.7 ms |        265.3 ms |       247.7 ms |           40.8 ms |
| Warm restore |           - |                - |          - |        275.3 ms |       257.6 ms |           19.1 ms |

The baseline confirms one actionable duplication: cold sign-in sends two
session-presence requests before and immediately after authenticated entry.
Warm restore sends one. Bootstrap is one request in both journeys. Server
bootstrap authentication dominates the warm server phase, while the intentional
900 ms minimum splash and development-build overhead remain part of the warm
end-to-end result. No production behavior has been changed at this stage.

## Server-path decision

Step 2 intentionally makes no production server-path change. The measured
server medians—226.2 ms for credential login and 275.3 ms for warm bootstrap—are
well inside the feature's local 5-second login and 8-second bootstrap P95
thresholds and account for only a minority of the roughly 2.1-second client
journeys.

The instrumentation narrows bootstrap time to the authentication boundary but
does not identify any redundant dependency within it. That boundary deliberately
orders local token verification, live revocation, Supabase MFA-factor lookup,
active membership, token-bound organization resolution, billing, setup, and
inactive-employee enforcement. Credential login similarly preserves rate
limiting, verified credentials, platform-role rejection, target membership,
billing, token organization reconciliation, and guarded trial activation.
Parallelizing or removing any of those calls from aggregate timing alone would
be speculative and could change failure precedence or weaken a security check.

The mobile auth-core and web route tests continue to cover token rejection,
revocation, MFA assurance, setup and billing locks, inactive employees,
membership and organization mismatch, organization-claim reconciliation,
Gridmaster rejection, rate limiting, and the supported member roles. The next
evidence-backed repair is therefore client-side consolidation of the confirmed
duplicate cold-login presence request.

## After mobile handoff consolidation

Step 3 removed the fire-and-forget presence registration from `LoginScreen`.
`AuthSessionProvider` is now the sole owner: it registers a newly observed access
token once, ignores an auth-state replay of the same token, and registers again
when the token changes. Bootstrap ownership, the stable user-and-organization
query key, restoration budgets, stale-completion handling, and the one-way
startup latch are unchanged.

The same Pixel 10 Pro XL emulator, Expo development build, local services, Calm
Haven membership, and three-sample procedure produced:

| Journey      |     Median |        P95 |    Maximum | Login requests | Bootstrap requests | Presence requests |
| ------------ | ---------: | ---------: | ---------: | -------------: | -----------------: | ----------------: |
| Cold sign-in | 2,480.8 ms | 2,994.6 ms | 2,994.6 ms |              1 |                  1 |                 1 |
| Warm restore | 2,546.7 ms | 2,583.9 ms | 2,583.9 ms |              0 |                  1 |                 1 |

Median client phases after the repair:

| Journey      | Restore |      Login |  Handoff |  Bootstrap |   Presence | Startup gate | Authenticated navigation |
| ------------ | ------: | ---------: | -------: | ---------: | ---------: | -----------: | -----------------------: |
| Cold sign-in |       - | 1,013.1 ms | 335.0 ms |   792.9 ms |   602.7 ms |   2,470.4 ms |               2,480.8 ms |
| Warm restore | 77.6 ms |          - |        - | 1,380.9 ms | 1,495.8 ms |   2,546.6 ms |               2,546.4 ms |

Median server phases after the repair:

| Journey      | Login total | Login rate limit | Login flow | Bootstrap total | Bootstrap auth | Bootstrap fan-out |
| ------------ | ----------: | ---------------: | ---------: | --------------: | -------------: | ----------------: |
| Cold sign-in |    266.6 ms |           8.7 ms |   261.6 ms |        175.3 ms |       150.8 ms |           24.0 ms |
| Warm restore |           - |                - |          - |        726.8 ms |       693.1 ms |           33.9 ms |

The confirmed cold duplication fell from two presence requests to one; login
and bootstrap remained at one request, and warm request counts did not change.
The cold presence phase fell from a 1,443.2 ms median to 602.7 ms. The cold
end-to-end median nevertheless moved up by 462.3 ms because the unchanged
credential-login and Supabase session-handoff phases varied upward by a combined
362.1 ms across this small local sample. One repaired cold run completed in
1,876.8 ms, below the original median, and all repaired samples remained below
the existing 5-second login threshold.

Warm client behavior was not touched by the consolidation. Its 407.7 ms median
increase coincided with a 451.5 ms increase in the measured bootstrap server
phase, so the observed change is accounted for by local server variation rather
than an added client wait. All warm samples remained below the existing 8-second
bootstrap threshold. These development-build samples are deliberately reported
as small-sample local evidence, not production latency claims.

## Qualification

Automated entry coverage now exercises successful regular-user, admin, and
super-admin mobile auth contexts and rejects Gridmaster access before membership
resolution. The existing route and package coverage also retains rate limiting,
verified identity, revocation, MFA assurance, token-bound organization context,
membership, billing, setup, inactive employee, terms, tenant-isolation, and
organization-switch behavior.

Final local verification on September 8, 2026:

- Focused mobile handoff suite: 5 files and 51 tests passed.
- Focused mobile auth and bootstrap routes: 3 files and 19 tests passed.
- Mobile workspace suite: 125 files and 1,008 tests passed.
- Combined mobile and shared-package gate: 15 tasks passed.
- Web suite: 381 files and 3,250 tests passed.
- Repository type-check: all 24 workspace tasks and the root type-check passed.
- Lint: passed with zero errors and five pre-existing warnings.
- Production web build: passed, including TypeScript and static-page generation.

Qualification caught two instrumentation integration issues before completion:
the server-timing reader now tolerates lightweight test response doubles that
omit `headers`, and the development-build `__DEV__` guard is declared for both
the mobile and root TypeScript projects. Neither change broadens diagnostics or
affects production authentication behavior.

This result does not include native process startup before JavaScript, an iOS
sample, physical-device testing, app-store builds, slow/offline recovery, token
rotation, foreground resume, or organization switching. Those remain release
qualification or later authentication-entry work and are not inferred from the
Android development-build samples.
