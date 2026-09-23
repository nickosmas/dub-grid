# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P1] closed - MFA enforcement fails open when the enrollment claim is absent

**File:** `supabase/migrations/038_mfa_enforced_in_policies.sql:21`; `packages/authz/src/assurance.ts:63`
**Found:** 2026-09-23 by `/audit` (scope: migrations 037-038 and MFA session boundaries; lens: security)
**Why it matters:** Migration 038 deliberately maps a missing `mfa_enrolled` claim to false, and the shared application helper likewise challenges only the literal value `true`. An enrolled caller holding an access token minted before migration 037 therefore remains authorized at AAL1 through Route Handlers, the data API, and Realtime until that token expires. Production access tokens have a one-hour lifetime, so the rollout exposure is bounded, but MFA is not fully enforced during that interval and a future hook regression that omitted the claim would fail open again.
**Suggested fix:** Do not rewrite the applied migrations or revoke every session. After one full production JWT lifetime plus clock-skew margin has elapsed from the migration-037 apply time, add a forward migration that treats a missing or malformed enrollment claim as challenge-pending below AAL2, make the shared application helper use the same fail-closed rule, and update the SQL, shared-helper, API-boundary, and live data-access tests.
**Resolution:** Partially repaired 2026-09-23. The rollout half is empty in fact: production holds 0 MFA factors and 0 AAL2 sessions, and no pre-037 token survives (newest session refresh was 2026-09-08), so no enrolled caller was ever authorized at AAL1. The live risk is the latent one the finding names second: the hook has been redefined in 002, 021 and 037, every existing hook test reads its own fixed migration file, so a fourth redefinition that dropped the claim would have passed CI and disabled enforcement silently. `apps/web/src/__tests__/access-token-hook-claims.test.ts` now resolves the newest definition of `custom_access_token_hook` and asserts it still mints every claim the app gates on, proven by a simulated regression that fails 8 of its 9 assertions. Runtime half repaired the same day at the user's direction, overriding the deferral. Migration `041_mfa_claim_fails_closed.sql` inverts the default: only the hook's jsonb boolean `false` counts as not enrolled, `aal2` always passes, and everything else (absent, wrong type, malformed) is challenge-pending. The comparison is `-> 'mfa_enrolled' = 'false'::jsonb` rather than `->>`, because the text rendering of the JSON string "false" and the boolean false are identical and only the latter is what the hook mints; it is also cast-free, so a malformed claim denies instead of raising inside a policy helper. `evaluateMfaClaimState` in `packages/authz/src/assurance.ts` is the matching application rule, three-state on purpose: `challenge-required` is actionable and still redirects to the login screen, while `claim-unusable` cannot be answered by a challenge and must not, so `proxy.ts` lets it fall through to the existing missing-claims path and `api-auth.ts` answers 401 rather than a step-up. Verified: the seven-case live matrix in `mfa-claim-fails-closed.integration.test.ts`, the newest-definition assertions in `mfa-claim-fails-closed-sql.test.ts`, a clean `db:reset` to ledger 41, and the full web (4199) and mobile suites. The change surfaced 34 tests whose claim fixtures had no `mfa_enrolled`, every one of them simulating a pre-037 token; their builders now default it to `false`, which is what a real token carries. Not yet applied to production: `041` needs `supabase db push --linked`, which is the user's step.

Re-reviewed 2026-09-23 by `/audit` (scope: full; all lenses) and closed. The original fail-open is gone: the live seven-case matrix in `mfa-claim-fails-closed.integration.test.ts` shows an absent, wrong-type and malformed claim all pending, `aal2` and the hook's boolean `false` both passing, and the pre-existing real-token enrol/challenge/refresh test still green. The repair introduced no new runtime defect that this pass could find: the only SQL callers are `caller_org_id` and `is_gridmaster` (both unchanged and inheriting by name), a claim-less service-role or superuser context behaves exactly as before (`org_id` was already absent, so `caller_org_id` already returned NULL), the public anon cookie-consent INSERT still succeeds and no anon-reachable policy routes through the helper, and a clean `db:reset` to ledger 41 plus the full web suite (491 files, 4199 tests) and mobile suite are green. It did leave one maintainability defect, recorded separately as F-04. Disclosure: the repair and this review were made in the same session, so this close is not an independent pass.

### F-02 [P1] open - A client sets the ceiling on how many schedule cells one series creates

**File:** `apps/web/src/app/api/schedule/manage/route.ts:200`; `supabase/migrations/002_functions_triggers.sql:1975`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security, performance)
**Why it matters:** `MAX_SERIES_OCCURRENCES = 183` is the intended bound, but it is only a default. The route validates `maxOccurrences` as `z.number().int().positive().nullable()` and `endDate` as any `z.string().date()`, passes both to `create_shift_series`, and the RPC's cap is `COALESCE(p_max_occurrences, 183)` with no clamp (verified against the live function body: no `LEAST`). Its loop is bounded only by those two client values, so one authenticated request from an editor with `canEditShifts` can ask for a daily series to 2099 and generate tens of thousands of `schedule_cells`, each with a snapshot and segments, in a single transaction. That is an availability risk and it silently defeats the bound the constant exists to express. Reached through `auth.userClient`, so RLS applies, but RLS does not bound row count.
**Suggested fix:** Clamp server-side in both places rather than one: `LEAST(COALESCE(p_max_occurrences, 183), 183)` in a forward migration, and `z.number().int().positive().max(MAX_SERIES_OCCURRENCES)` plus an explicit ceiling on how far `endDate` may sit from `startDate` in the route schema. Keep the constant as the single source.
**Resolution:**

### F-03 [P2] open - Deleting a long series reads only its first 1,000 cells, orphaning shift notes

**File:** `apps/web/src/app/api/schedule/manage/route.ts:1484`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: performance)
**Why it matters:** The read of a series' cells before `delete_shift_series` is unpaged, and `db.max_rows = 1000` (`supabase/config.toml:18`) applies to every role including `service_role`. The rows feed `clearScheduleNotesForCells`, and `schedule_notes` has no foreign key to the cell, so notes on cells past the first 1,000 survive the deletion and render an indicator against a shift that no longer exists. This is the same class as the already-repaired F-11 truncation, and it violates the standing rule that every shift-removal path clears notes. Only reachable while F-02 stands, since 183 occurrences cannot cross the cap; it is recorded separately because raising the legitimate series ceiling would reintroduce it even after F-02 is clamped.
**Suggested fix:** Page the read with `.range` in a deterministic order, reusing the pager shape already used by `fetchNormalizedPublishedShiftRows` and `fetchScheduleCellQueryRows`.
**Resolution:**

### F-04 [P2] open - requiresMfaChallenge is now exported with no caller, and is the shape that reintroduces the loop

**File:** `packages/authz/src/assurance.ts:84`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: quality)
**Why it matters:** The F-01 repair moved both production call sites (`apps/web/src/proxy.ts:345`, `apps/web/src/lib/api-auth.ts:174`) onto `evaluateMfaClaimState`, leaving `requiresMfaChallenge` with no caller in `apps/web/src`, `apps/mobile/src` or any `packages/*/src` outside its own definition and tests. Dead code is against the standards on its own, but the specific risk is worse than tidiness: it is the boolean collapse of a distinction that exists for a reason. A future caller who reaches for the obvious-looking name loses the split between `challenge-required` and `claim-unusable`, and redirecting the latter to the login screen is an unbreakable loop, because a challenge cannot supply a claim the token never carried.
**Suggested fix:** Delete it and its tests, since `evaluateMfaClaimState` covers every case. If a boolean is wanted for parity with the SQL helper, keep it but mark it internal to the package and state in one line that call sites must branch on the state instead.
**Resolution:**

### F-05 [P3] open - Six integration claim builders hardcode the enrollment claim with no override

**File:** `apps/web/src/__tests__/draft-state-editor-only.integration.test.ts:124` and the same `asUser` helper in `row-level-trust-boundaries`, `employee-contact-columns`, `auto-approve-shift-requests`, `schedule-children-org-consistency` and `role-escalation-guards`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: tests)
**Why it matters:** The F-01 repair added `mfa_enrolled: false` to each of these literal claim objects, which is right (it is what a real token carries) but fixed: unlike `org-isolation`, whose setter spreads `{ mfa_enrolled: false, ...claims }` so a test can override it, these six cannot express an enrolled caller at all. Any future case in those files that wants to prove a policy refuses an unchallenged enrolled member has to edit the shared helper first, which is the kind of friction that ends in the case not being written.
**Suggested fix:** Give each `asUser` an optional claims override merged the way `org-isolation` does, or lift one shared helper into `__tests__/helpers/` and have all seven use it.
**Resolution:**

### F-06 [P3] open - change_user_role runs under the service role, so its own tier guards never fire

**File:** `apps/web/src/app/api/organizations/access/route.ts:276`; `packages/data-access/src/mobile.ts:1693`
**Found:** 2026-09-23 by `/audit` (scope: full; lens: security)
**Why it matters:** Both callers invoke the RPC with the service client, which has no `auth.uid()`, so the RPC's identity, caller-tier and admin-tier checks pass vacuously. This is documented at `packages/data-access/src/mobile.ts:1677` and the compensating application checks are real and were verified in this pass: the web route gates on `isGridmaster || isSuperAdmin` (`requirePrivilegedActor`), and the mobile gate's `canManageUsers` resolves to `isSuperAdmin || isGridmaster` and is false under impersonation (`packages/authz/src/index.ts:273`). So this is not currently exploitable and is recorded as defence in depth only: the database layer would not catch a future route whose gate drifted below super admin.
**Suggested fix:** Call the RPC with the user client at both sites so both layers are live, as the already-decided follow-up in the archived plan describes. The guards that do not read `auth.uid()` (expected-updated-at, self-action, last-super-admin) are unaffected either way.
**Resolution:**
