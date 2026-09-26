# Feature: Source and template drift guards

**From build-plan:** feature 41d2
**Status:** verified

## Goal

Where a rule lives in two places, a test should fail the moment they
disagree. Today locked migrations can be edited without CI noticing, the code
length the apps expect is a literal 6 in five places tied to `otp_length` by
nothing, the production push script's comparison has never run in a test,
the 72-hour invitation lifetime is written separately in web, the data
package and SQL, the invitations route matches SQL error text no test reads,
the hook's claim names are unlinked from the types that read them, and both
apps spell the step-up code as a literal.

## In scope

- **Migration checksums run with the tests.** A normal test checks the real
  migrations against `checksums.sha256`.
- **The emailed code length comes from one place.** `EMAIL_OTP_LENGTH` lives
  in `@dubgrid/domain`, the mobile recovery screens use it, and a test ties it
  to `otp_length` in `config.toml`. `TOTP_CODE_LENGTH` sits beside it; the
  other six-digit authenticator fields keep their literal, since the TOTP
  standard fixes it and no setting can move it.
- **The push script's comparison is tested.** `readConfig` and `diff` are
  exported behind a main guard and unit-tested, booleans included (F-22).
- **Two-factor removal then reconcile is tested as one sequence** (F-22).
- **One invitation lifetime.** A shared constant in `@dubgrid/domain` is used
  by web and the data package, and a test checks the SQL default says
  72 hours.
- **The SQL messages the invitations route matches are read from SQL.** A
  test finds the latest `replace_pending_invitation_access` and asserts each
  matched message is still raised.
- **Claim names are linked.** A test asserts every non-standard claim the web
  and mobile claim types read is one the hook mints.
- **One step-up code.** Web imports `STEP_UP_REQUIRED_CODE`; mobile has no
  dependency on `@dubgrid/authz` (adding one needs an install), so a test
  checks its copy against the constant.

## Out of scope

- The password rule against Supabase's `letters_digits`: aligning them
  changes password policy on both apps, so it is recorded as a decision.
- Comparing production's wider auth settings (41d3).

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - migration checksums in the test run** - _Done when:_ the
      test passes today and fails when a locked migration's bytes change.
- [x] **Step 2 - code lengths** - _Done when:_ the mobile recovery code
      paths use the constants and the config test passes.
- [x] **Step 3 - push script and reconcile sequence (F-22)** - _Done when:_
      the script's diff is tested with booleans, and the lifecycle test
      removes the last factor then reconciles with one alert.
- [x] **Step 4 - invitation lifetime and SQL messages** - _Done when:_ one
      constant is used, the SQL default is checked, and the matched messages
      are read from SQL.
- [x] **Step 5 - claim names and the step-up code** - _Done when:_ the claim
      test and the imports are in place.
- [x] **Step 6 - audit repairs** - F-48 (the web test task hashes the files
      its guards read) and F-49 (guards tightened). _Done when:_ a dry run
      lists the inputs and the tightened tests pass.

## Files / areas

- `supabase/migrations/checksums.sha256`, `apps/web/src/lib/db/` migration
  tooling, a new test.
- `packages/domain`, mobile `ResetPasswordScreen.tsx`, web `MFAVerify.tsx`,
  `MFASetup.tsx`, `StepUpForm.tsx`.
- `scripts/push-auth-templates.ts`.
- `apps/web/src/lib/auth/invitation-capability.ts`,
  `packages/data-access/src/mobile.ts`,
  `apps/web/src/app/api/organizations/invitations/route.ts`.
- Web and mobile step-up helpers.

## Data / contracts

- No schema change.

## Testing

- Each step is a test that fails when the two sides diverge.

## Notes for the AI

- No em dashes.

## Verification notes

- `npm run test` on the final tree: web ran fresh (4650/4650), mobile
  replayed an unchanged cache (1334/1334); `npm run build` passed on the
  guard changes.
- `turbo --dry=json` shows the web test task hashing `supabase/**` (less the
  CLI's local state), the root README, `scripts/**`, `eslint-rules/**`,
  `packages/*/src/**` and `apps/mobile/{src,app}/**`.
- The password rule against Supabase's `letters_digits` is recorded as the
  decision F-47, not changed.

## Findings

### 41d2/F-22 [P3] closed - 41c1 test gaps: the remove-then-reconcile sequence and the push script's compare

**File:** `apps/web/src/__tests__/mfa-lifecycle.test.ts`; `scripts/push-auth-templates.ts:155`
**Found:** 2026-09-25 by `/audit` (scope: current, 0d010ca0..4d2b515c; all lenses)
**Why it matters:** Each half of "a later reconcile sends nothing" is tested separately, not the sequence, and the script's boolean compare runs only in production use; a source-text check stands in for it.
**Suggested fix:** A test that removes the last factor and then reconciles; export the script's `diff` behind a main guard and test it.
**Resolution:** Fixed in 41d2: `readConfig` and `diff` are exported behind a main guard and tested (booleans included; the script still runs as a script), and `mfa-remove-then-reconcile.test.ts` runs the lifecycle removal and the status reconcile against one stored flag and sees one alert. Closed by the 41d2 audit (a4fa18a7..395a6e57), which examined both tests; its one weakness, the sequence test not pinning which route alerted, was tightened under F-49 and passed re-review.

### 41d2/F-48 [P1] closed - Turbo's cache replayed a pass when only the other side of a guard changed

**File:** `turbo.json` (`test` task); `.github/workflows/ci.yml:73`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** `@dubgrid/web#test` hashed only files under `apps/web/`, so a change to a migration, `config.toml`, a template, the push script or the mobile step-up literal alone replayed a cached pass in CI and the pre-push hook: exactly the drift 41d2's guards exist to catch.
**Suggested fix:** Give the web test task the outside files as inputs.
**Resolution:** `@dubgrid/web#test` lists `supabase/config.toml`, `supabase/migrations/**`, `supabase/templates/**`, `scripts/**` and the mobile step-up file as inputs; a `turbo --dry=json` run shows each in the task's input hash. Re-review (26595aa8): closed.

### 41d2/F-49 [P3] closed - 41d2 guards that could pass for the wrong reason

**File:** `apps/web/src/__tests__/mfa-remove-then-reconcile.test.ts`; `invitation-sql-contract.test.ts`; `access-token-hook-claims.test.ts`; `migration-readiness.test.ts`; `push-auth-templates.test.ts`; `scripts/push-auth-templates.ts:236`
**Found:** 2026-09-25 by `/audit` (scope: current, a4fa18a7..395a6e57; all lenses)
**Why it matters:** The sequence test could not tell which route alerted; the SQL reader matched GRANT or DROP lines as definitions; the claim parser read the wrong block when a type was missing and skipped `readonly` keys; the mutation test leaked a temp copy of the migrations; the push test hard-coded 6; and the script's run guard silently skipped a symlinked path.
**Suggested fix:** Tighten each.
**Resolution:** The sequence test asserts the alert right after removal; the SQL test uses the anchored `latestFunctionDefinition`; `claimKeys` throws on a missing type and accepts `readonly`; the temp copy is removed; the push test uses `EMAIL_OTP_LENGTH`; the guard compares real paths (the script runs by relative and absolute path). Re-review (26595aa8): closed.

### 41d2/F-51 [P2] closed - Older web tests read mobile, package and lint-rule files the cache did not hash

**File:** `turbo.json` (`@dubgrid/web#test`)
**Found:** 2026-09-25 by `/audit` re-review of 26595aa8
**Why it matters:** `auth-integrity-entry-points`, `architecture-boundaries`, `supabase-templates` and `no-floating-async-handler` read `apps/mobile/src`, `apps/mobile/app`, every `packages/*` and `eslint-rules/`, so a change only there replayed a cached pass: the F-48 class, not fixed by it.
**Suggested fix:** Add those trees to the inputs.
**Resolution:** The task lists `../mobile/src/**`, `../mobile/app/**`, `../../packages/*/src/**` and `../../eslint-rules/**` (replacing the single mobile file); a dry run counts files from each. Re-review (67898ab0): kept open, since the seed SQL, `supabase/patches/**` and the root `README.md` were still read unhashed. Second repair: the inputs cover all of `../../supabase/**` and `../../README.md`; a dry run lists the seeds, the patch and the README. Re-review (cd8758d8): closed; `packages/*/vitest.config.ts` and a root `vercel.json` (checked only for absence) stay outside, judged negligible.

### 41d2/F-52 [P3] closed - The push script's run guard threw on an entry path that is not a file

**File:** `scripts/push-auth-templates.ts:237`
**Found:** 2026-09-25 by `/audit` re-review of 26595aa8
**Why it matters:** `npx tsx scripts/push-auth-templates` (no extension) failed with ENOENT, and any importer with a non-file `argv[1]` failed at import.
**Suggested fix:** Treat an unresolvable path as not the script, trying the `.ts` spelling.
**Resolution:** `runAsScript()` tries the path and its `.ts` spelling and treats a failure as not the script; the relative, extensionless and absolute invocations all run. Re-review (67898ab0): closed.

### 41d2/F-53 [P3] closed - Migration-readiness tests left temp directories behind

**File:** `apps/web/src/__tests__/migration-readiness.test.ts:75`
**Found:** 2026-09-25 by `/audit` re-review of 26595aa8
**Why it matters:** Three older tests created `dubgrid-*` directories and never removed them; 99 had accumulated.
**Suggested fix:** Remove them after each test.
**Resolution:** A `tempDir` helper records each directory and an `afterEach` removes it. The 99 left by earlier runs remain in the OS temp directory. Re-review (67898ab0): closed.
