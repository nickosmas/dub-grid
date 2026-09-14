# Feature: Authentication release qualification

**From build-plan:** feature 19e
**Status:** verified

## Goal

Turn the completed authentication and onboarding work into durable release
evidence across roles, account states, browsers, and native devices. The matrix
must identify what is automated, what was observed directly, what remains
unavailable, and must not mark the authentication epic complete by inference.

## In scope

- Define one machine-checked role, state, surface, and browser qualification
  matrix covering public entry, regular users, management users, super admins,
  and Gridmaster boundaries.
- Cover active, suspended, inactive, invited, recovery, MFA-disabled,
  MFA-enabled, stale-session, revoked-session, and organization-switch states.
- Reuse the seeded QA identities and local Supabase only. Add deterministic QA
  fixtures when a required role or state lacks a safe automated identity.
- Run authenticated Calm Haven browser checks in Chromium, Firefox, and WebKit
  where the local environment supports them.
- Run available Android and iOS simulator checks, including a TOTP-enabled
  account, and record physical-device evidence without substituting simulator or
  component evidence for it.
- Close every confirmed in-scope defect, rerun affected matrix rows, and retain
  exact evidence for unavailable hosted-provider or device rows.

## Out of scope

- Production deployment, production data, production credentials, remote
  provider configuration, or migration application outside local development.
- New authentication methods, account lockout, passkeys, backup codes, or a
  redesign of login, onboarding, billing, or profile screens.
- General cross-browser or native application QA unrelated to authentication,
  onboarding, tenancy, billing gates, MFA, or session continuity.
- Waiving a required physical-device row because equivalent automated or
  simulator tests pass.

## Build loop

Continuous Mode implements these steps serially, repairs confirmed defects,
runs the complete verification gate, archives the result, and creates one local
`dev` commit. It does not push or deploy.

## Build steps

- [x] **Step 1 - Define the release matrix contract** - inventory the required
      roles, account states, organizations, transports, browser engines, native
      platforms, and evidence types from features 19a through 19d4. _Done when:_
      a typed matrix and structural test fail for an omitted required dimension,
      duplicate row, unsafe fixture, or row with no explicit evidence owner.
- [x] **Step 2 - Make QA fixtures deterministic** - add only the local seeded
      identities and state transitions needed to exercise regular, management,
      super-admin, and MFA-enabled paths without personal accounts. _Done when:_
      fixtures are idempotent, secret values remain local test constants, tenant
      scope is explicit, and cleanup or reseeding restores a known state.
- [x] **Step 3 - Automate browser role and state rows** - add Playwright coverage
      for public, regular, management, super-admin, suspension recovery,
      onboarding completion, and unauthorized-route behavior. _Done when:_ the
      same matrix rows run against Chromium, Firefox, and WebKit without stale
      tenant data, forbidden controls, or post-admission onboarding replay.
- [x] **Step 4 - Automate MFA and session rows** - cover MFA-disabled and
      MFA-enabled entry, stale and revoked sessions, sign-out propagation,
      recovery completion, and organization switching. _Done when:_ assurance
      gates and session transitions match the shared contracts and no user is
      admitted under stale identity, tenant, billing, or onboarding state.
- [x] **Step 5 - Exercise Calm Haven browser qualification** - run the supported
      browser matrix with console and network failure collection, then directly
      inspect the most security-sensitive Calm Haven transitions. _Done when:_
      all supported rows pass or have a reproduced defect, and browser-specific
      gaps are recorded rather than hidden by a Chromium-only result.
- [x] **Step 6 - Exercise native qualification** - run Android and iOS simulator
      coverage available on this host, including a TOTP-enabled account, then
      perform or record the required physical-device rows. _Done when:_ native
      login, MFA challenge, foreground refresh, sign-out, suspension recovery,
      and organization switching have direct evidence, with unavailable device
      evidence named explicitly.
- [x] **Step 7 - Repair and rerun confirmed defects** - fix only defects exposed
      by the qualification matrix and rerun each affected row plus adjacent
      regressions. _Done when:_ no confirmed in-scope defect remains open and
      every repair is tied to a matrix row and focused regression.
- [x] **Step 8 - Qualify and close the authentication epic** - run the full test
      suite, type-check, lint, formatting, generated email checks, production
      build, and final findings check. _Done when:_ every automated gate passes,
      the matrix records all browser and native evidence, required physical
      device evidence exists, 19e and parent feature 19 are checked, and no P0
      or P1 finding remains open or fixed.

## Files / areas

- `e2e/` authentication helpers, matrix contract, and Playwright specifications
- `playwright.config.ts` browser projects and local server behavior
- `seed.ts` local-only QA identities and deterministic state
- Web and mobile authentication, onboarding, billing, session, and MFA tests
- Native simulator tooling and recorded qualification evidence
- Blueprint feature history from 19a through 19d4

## Data / contracts

- Matrix rows use non-personal local QA identities and name their expected role,
  organization, account state, admission result, destination, and forbidden UI.
- An automated result is distinct from a directly observed browser, simulator,
  hosted-provider, or physical-device result.
- No row may carry a raw password, recovery capability, invitation capability,
  access token, refresh token, TOTP seed, or one-time code in logs or artifacts.
- Browser and native state transitions must reconcile server authority before
  admitting a user or rendering tenant data.
- A missing browser engine, simulator, hosted provider, or physical device is an
  explicit unavailable result, not a pass.

## Testing

- Structural and unit tests validate matrix completeness and safe fixtures.
- Playwright runs all applicable authentication rows across Chromium, Firefox,
  and WebKit.
- Existing web, mobile, shared-domain, local-Supabase, and session-continuity
  tests remain part of the evidence.
- Runtime collection fails on unexpected console errors, network errors, tenant
  leakage, forbidden controls, or onboarding shown after admission.
- Final gates: `npm run test`, `npm run type-check`, `npm run lint`,
  `npm run format:check`, web workspace `email:build`, and `npm run build`.

## Qualification evidence

- Browser matrix: 27 Playwright rows passed in Chromium, Firefox, and WebKit,
  including active, inactive, suspended, restored, onboarding-complete, MFA,
  stale-session, revoked-session, and organization-switch behavior.
- Android emulator: Calm Haven regular and MFA-enabled entry, MFA challenge,
  foreground suspension recovery, sign-out, and regular organization switching
  were observed directly. The release artifact built successfully; the debug
  artifact was used for local HTTP simulator evidence because production uses
  HTTPS and the release manifest correctly disallows cleartext traffic.
- iOS simulator: Calm Haven regular and MFA-enabled entry, MFA challenge,
  sign-out, super-admin organization switching, and regular suspension recovery
  were observed directly. The release artifact built successfully after
  repairing Expo public-environment embedding. Suspension immediately showed
  the neutral unavailable gate, and restoring the organization to `trialing`
  returned directly to Home through `Try again`.
- Physical iPhone: an automatically signed Release build was installed on a
  paired iPhone 17 Pro Max on 2026-09-14. A regular Calm Haven user switched to
  Arden Wood and back with the organization identity updating immediately. The
  same device showed the neutral unavailable gate after a local suspension and
  returned directly to Home through `Try again` after the organization was
  restored, retaining the session. A TOTP-enabled Calm Haven account completed
  the native MFA challenge and reached Home without a loop or stale gate. The
  temporary test factor was removed after observation.
- Defects repaired and rerun: Expo public environment variables are now
  statically embedded in native release builds; organization switching closes
  the native picker before presenting confirmation; cross-tab web sign-out now
  broadcasts its boundary change; inactive users cannot replay onboarding after
  admission; browser qualification uses deterministic local auth state.
- Final automated gates on 2026-09-14: all 22 test tasks passed, including 426
  web test files and 3,645 web tests; type-check passed; lint passed with five
  pre-existing warnings and no errors; formatting passed; all 10 generated-email
  tests passed; and the production build passed. The findings ledger has no open
  or fixed P0 or P1 findings.

## Completion status

All required browser, simulator, and physical-device rows have direct evidence.
The final verification commands passed against this exact completion candidate,
and the findings ledger has no open or fixed P0 or P1 finding. No push, deploy,
or production change has been performed for 19e.

## Notes for the AI

- Use Calm Haven for direct runtime testing.
- Do not use personal accounts in automation or expose test credentials in
  progress updates.
- Preserve the existing login performance budgets and avoid serial setup that
  makes the matrix unreliable.
- Do not mark feature 19 or 19e complete without the required physical-device
  evidence.
