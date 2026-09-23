# Bound schedule-series creation

**Type:** Fix
**Status:** verified
**Fixes:** F-02, F-04

## The problem

The schedule-series API treats 183 occurrences as a client-side convention, not
an enforced server boundary. A caller can submit an arbitrarily large
`maxOccurrences` and a distant `endDate`, and the database function accepts
both values without a clamp. One authorized request can therefore create tens
of thousands of schedule cells and their child rows in a single transaction.

The completed MFA repair also left `requiresMfaChallenge` exported with no
production caller. Its boolean result collapses the intentional distinction
between a challengeable session and an unusable claim, making it unsafe dead
code.

## The fix

Enforce the existing `MAX_SERIES_OCCURRENCES` limit at both trust boundaries.
The route will reject counts above 183 and reject an end date beyond the longest
supported 183-occurrence cadence (one occurrence every two weeks). A new
forward migration will clamp the RPC's effective cap to 183 even when the route
is bypassed. Keep `MAX_SERIES_OCCURRENCES` as the application source of truth,
preserve valid daily, weekly, and biweekly series, and do not edit an applied
migration.

Delete `requiresMfaChallenge` and its direct tests. Production callers must
continue branching on `evaluateMfaClaimState`.

## Build steps

- [x] **Step 1 - Enforce the application boundary.** Tighten the
      `createShiftSeries` request validation so `maxOccurrences` cannot exceed
      `MAX_SERIES_OCCURRENCES`, `endDate` cannot precede `startDate`, and the
      requested date span cannot exceed `MAX_SERIES_OCCURRENCES * 14` days. Add
      focused route tests for rejected over-limit input and accepted boundary
      input. Done when an over-limit request returns 400 before authentication or
      RPC work, while a valid boundary request still reaches the existing handler.

- [x] **Step 2 - Enforce the database boundary.** Add migration 042 that
      redefines `public.create_shift_series` with its effective cap clamped to
      183, retains the existing authorization and atomic write behavior, and
      bounds the date scan to 183 * 14 days even for direct RPC callers, and
      updates the migration checksum ledger. Add a newest-definition SQL regression
      test so a later redefinition cannot silently remove the clamp. Done when both
      an explicit value above 183 and the default path can create at most 183 cells,
      and migration validation plus the focused SQL test pass.

- [x] **Step 3 - Remove the unsafe dead MFA helper.** Delete the uncalled
      `requiresMfaChallenge` export and its direct tests without changing
      `evaluateMfaClaimState` or either production caller. Done when no source or
      test reference remains and the authz package tests pass.

## Verify

- From `apps/web`: `../../node_modules/.bin/vitest run --config vitest.config.mts src/app/api/schedule/manage/route.test.ts src/__tests__/shift-series-bounds-sql.test.ts src/__tests__/shift-series-bounds.integration.test.ts`
- Run the focused newest-definition SQL regression test for migration 042.
- `npm run db:migrations:check`
- `npm run db:reset`
- `npm run test --workspace=@dubgrid/authz`
- `npm run type-check`
- Full web suite plus `npm run test -- --filter='!@dubgrid/web'` (all workspaces).
- `npm run build`

## Verification evidence (2026-09-23)

- Focused route tests: 34 passed, including 11 new bounds cases.
- Newest-definition SQL regression tests: 3 passed.
- Local authenticated-role database tests: 5 passed. Daily and biweekly requests
  for 100,000 occurrences stop at 183; the default cap stops at 183; a cap of one
  creates one; a nonmatching weekday finishes with zero. Each test rolls back.
- `npm run db:migrations:check`: passed, 42 contiguous checksum-locked migrations.
- `npm run db:reset`: passed, applied through 042 and recreated local QA data.
- Authz build and tests: passed, 56 tests.
- `npm run type-check`: passed.
- Full web suite: passed via `npm --workspace @dubgrid/web run test -- src/app/api/schedule/manage/route.test.ts src/__tests__/shift-series-bounds-sql.test.ts`.
  The package script includes `src`, so these extra filters still ran the
  full suite. The new live database file was also run separately after creation.
- `npm run test -- --filter='!@dubgrid/web'`: passed, covering the remaining
  workspace test tasks; unchanged tasks used Turbo cache.
- `npm run test:mobile`: passed, cached.
- `npm run build`: passed.
- `npm run lint`: passed with three existing img-element warnings.
- `git diff --check`: passed.
- Changed-code audit across quality, security, performance and tests: no new
  findings; F-02 and F-04 closed after a separate same-session review pass.
  Reviewed route validation and tests, migration and checksum, SQL/live tests,
  authz deletion and its remaining callers. Generated and third-party files
  were excluded. This was not a full-project or independent-agent audit.

## Completion (2026-09-23)

Completed on dev with the user's /complete authorization. Final checks:

- `npm run test`: passed, 23 successful Turbo tasks; web had 493 files and
  4,218 passing tests, including the five live database bounds cases.
- `npm run type-check` and `npm run build`: passed.
- `npm run lint`: passed with three existing img-element warnings.
- `npm run lint:rules`: the existing directory argument fails discovery on
  Node 22.13.0. Equivalent explicit invocation `node --test eslint-rules/*.test.*`
  passed all eight tests. No lint-rule or package-script changes were made.
- `npm run db:migrations:check`: passed, 42 checksum-locked migrations.
- Local reset and focused verification evidence above were reused.
- Regular audit, check and try-guide policies are manual. Repair review is
  recorded above; browser E2E and native-device checks were not run.

No push or production migration was performed. F-03, F-05 and F-06 remain in the
live ledger. The carried-forward F-01 closure below retains its earlier repair
and review provenance; this fix specifically repaired F-02 and F-04.

## How to try it

From `apps/web`, run
`../../node_modules/.bin/vitest run --config vitest.config.mts src/app/api/schedule/manage/route.test.ts src/__tests__/shift-series-bounds.integration.test.ts`.
With the seeded local database running, expect 34 route tests and five database
tests to pass. The database tests roll back their writes.

## Findings

### bound-schedule-series-creation.md/F-01 [P1] closed - MFA enforcement fails open when the enrollment claim is absent

**File:** `supabase/migrations/038_mfa_enforced_in_policies.sql:21`; `packages/authz/src/assurance.ts:63`
**Found:** 2026-09-23 by `/audit` (scope: migrations 037-038 and MFA session boundaries; lens: security)
**Why it matters:** Migration 038 deliberately maps a missing `mfa_enrolled` claim to false, and the shared application helper likewise challenges only the literal value `true`. An enrolled caller holding an access token minted before migration 037 therefore remains authorized at AAL1 through Route Handlers, the data API, and Realtime until that token expires. Production access tokens have a one-hour lifetime, so the rollout exposure is bounded, but MFA is not fully enforced during that interval and a future hook regression that omitted the claim would fail open again.
**Suggested fix:** Do not rewrite the applied migrations or revoke every session. After one full production JWT lifetime plus clock-skew margin has elapsed from the migration-037 apply time, add a forward migration that treats a missing or malformed enrollment claim as challenge-pending below AAL2, make the shared application helper use the same fail-closed rule, and update the SQL, shared-helper, API-boundary, and live data-access tests.
**Resolution:** Partially repaired 2026-09-23. The rollout half is empty in fact: production holds 0 MFA factors and 0 AAL2 sessions, and no pre-037 token survives (newest session refresh was 2026-09-08), so no enrolled caller was ever authorized at AAL1. The live risk is the latent one the finding names second: the hook has been redefined in 002, 021 and 037, every existing hook test reads its own fixed migration file, so a fourth redefinition that dropped the claim would have passed CI and disabled enforcement silently. `apps/web/src/__tests__/access-token-hook-claims.test.ts` now resolves the newest definition of `custom_access_token_hook` and asserts it still mints every claim the app gates on, proven by a simulated regression that fails 8 of its 9 assertions. Runtime half repaired the same day at the user's direction, overriding the deferral. Migration `041_mfa_claim_fails_closed.sql` inverts the default: only the hook's jsonb boolean `false` counts as not enrolled, `aal2` always passes, and everything else (absent, wrong type, malformed) is challenge-pending. The comparison is `-> 'mfa_enrolled' = 'false'::jsonb` rather than `->>`, because the text rendering of the JSON string "false" and the boolean false are identical and only the latter is what the hook mints; it is also cast-free, so a malformed claim denies instead of raising inside a policy helper. `evaluateMfaClaimState` in `packages/authz/src/assurance.ts` is the matching application rule, three-state on purpose: `challenge-required` is actionable and still redirects to the login screen, while `claim-unusable` cannot be answered by a challenge and must not, so `proxy.ts` lets it fall through to the existing missing-claims path and `api-auth.ts` answers 401 rather than a step-up. Verified: the seven-case live matrix in `mfa-claim-fails-closed.integration.test.ts`, the newest-definition assertions in `mfa-claim-fails-closed-sql.test.ts`, a clean `db:reset` to ledger 41, and the full web (4199) and mobile suites. The change surfaced 34 tests whose claim fixtures had no `mfa_enrolled`, every one of them simulating a pre-037 token; their builders now default it to `false`, which is what a real token carries. Not yet applied to production: `041` needs `supabase db push --linked`, which is the user's step.

Re-reviewed 2026-09-23 by `/audit` (scope: full; all lenses) and closed. The original fail-open is gone: the live seven-case matrix in `mfa-claim-fails-closed.integration.test.ts` shows an absent, wrong-type and malformed claim all pending, `aal2` and the hook's boolean `false` both passing, and the pre-existing real-token enrol/challenge/refresh test still green. The repair introduced no new runtime defect that this pass could find: the only SQL callers are `caller_org_id` and `is_gridmaster` (both unchanged and inheriting by name), a claim-less service-role or superuser context behaves exactly as before (`org_id` was already absent, so `caller_org_id` already returned NULL), the public anon cookie-consent INSERT still succeeds and no anon-reachable policy routes through the helper, and a clean `db:reset` to ledger 41 plus the full web suite (491 files, 4199 tests) and mobile suite are green. It did leave one maintainability defect, recorded separately as F-04. Disclosure: the repair and this review were made in the same session, so this close is not an independent pass.

### bound-schedule-series-creation.md/F-02 [P1] closed - A client sets the ceiling on how many schedule cells one series creates

**File:** `apps/web/src/app/api/schedule/manage/route.ts:200`; `supabase/migrations/002_functions_triggers.sql:1975`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security, performance)
**Why it matters:** `MAX_SERIES_OCCURRENCES = 183` is the intended bound, but it is only a default. The route validates `maxOccurrences` as `z.number().int().positive().nullable()` and `endDate` as any `z.string().date()`, passes both to `create_shift_series`, and the RPC's cap is `COALESCE(p_max_occurrences, 183)` with no clamp (verified against the live function body: no `LEAST`). Its loop is bounded only by those two client values, so one authenticated request from an editor with `canEditShifts` can ask for a daily series to 2099 and generate tens of thousands of `schedule_cells`, each with a snapshot and segments, in a single transaction. That is an availability risk and it silently defeats the bound the constant exists to express. Reached through `auth.userClient`, so RLS applies, but RLS does not bound row count.
**Suggested fix:** Clamp server-side in both places rather than one: `LEAST(COALESCE(p_max_occurrences, 183), 183)` in a forward migration, and `z.number().int().positive().max(MAX_SERIES_OCCURRENCES)` plus an explicit ceiling on how far `endDate` may sit from `startDate` in the route schema. Keep the constant as the single source.
**Resolution:** Repaired 2026-09-23. The route rejects counts above MAX_SERIES_OCCURRENCES (183), reversed ranges, and spans over 183 * 14 days. Migration 042 independently clamps the effective occurrence cap and date scan, preserving the existing authorization checks and atomic writes. Eleven route boundary cases, three newest-definition SQL assertions, and five local authenticated-role database cases pass; a request for 100,000 daily or biweekly occurrences produces 183 cells, the null cap produces 183, a cap of one produces one, and a nonmatching weekday terminates with zero. Local reset applied all 42 migrations and reseeded successfully. Production application remains a separate release action.

Re-reviewed 2026-09-23 with /audit (scope: changed; all four lenses). The route validates bounds before auth and RPC work; migration 042 differs from the previous function only in its two effective bounds, retaining permissions, tenant checks and snapshot writes. The authenticated-role live database tests exercise the repaired function and roll back every write. No new issue found in the repair. This was a separate review pass in the implementing session, not an independent-agent review. F-03 remains open for pre-existing oversized series and future changes to the bound.

### bound-schedule-series-creation.md/F-04 [P2] closed - requiresMfaChallenge is now exported with no caller, and is the shape that reintroduces the loop

**File:** `packages/authz/src/assurance.ts:84`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: quality)
**Why it matters:** The F-01 repair moved both production call sites (`apps/web/src/proxy.ts:345`, `apps/web/src/lib/api-auth.ts:174`) onto `evaluateMfaClaimState`, leaving `requiresMfaChallenge` with no caller in `apps/web/src`, `apps/mobile/src` or any `packages/*/src` outside its own definition and tests. Dead code is against the standards on its own, but the specific risk is worse than tidiness: it is the boolean collapse of a distinction that exists for a reason. A future caller who reaches for the obvious-looking name loses the split between `challenge-required` and `claim-unusable`, and redirecting the latter to the login screen is an unbreakable loop, because a challenge cannot supply a claim the token never carried.
**Suggested fix:** Delete it and its tests, since `evaluateMfaClaimState` covers every case. If a boolean is wanted for parity with the SQL helper, keep it but mark it internal to the package and state in one line that call sites must branch on the state instead.
**Resolution:** Repaired 2026-09-23. Removed the unused requiresMfaChallenge export and its two direct tests. evaluateMfaClaimState and both production callers are unchanged. Source search finds no remaining helper references; the authz build and all 56 remaining authz tests pass.

Re-reviewed 2026-09-23 with /audit (scope: changed; all four lenses). Confirmed deletion of only the unused wrapper and its tests; the three-state helper and web production call sites remain intact. Build, type checks, source reference search and the remaining authz cases pass. No new issue found. Same-session review.
