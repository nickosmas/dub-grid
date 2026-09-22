# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P1] open - MFA enforcement fails open when the enrollment claim is absent

**File:** `supabase/migrations/038_mfa_enforced_in_policies.sql:21`; `packages/authz/src/assurance.ts:63`
**Found:** 2026-09-23 by `/audit` (scope: migrations 037-038 and MFA session boundaries; lens: security)
**Why it matters:** Migration 038 deliberately maps a missing `mfa_enrolled` claim to false, and the shared application helper likewise challenges only the literal value `true`. An enrolled caller holding an access token minted before migration 037 therefore remains authorized at AAL1 through Route Handlers, the data API, and Realtime until that token expires. Production access tokens have a one-hour lifetime, so the rollout exposure is bounded, but MFA is not fully enforced during that interval and a future hook regression that omitted the claim would fail open again.
**Suggested fix:** Do not rewrite the applied migrations or revoke every session. After one full production JWT lifetime plus clock-skew margin has elapsed from the migration-037 apply time, add a forward migration that treats a missing or malformed enrollment claim as challenge-pending below AAL2, make the shared application helper use the same fail-closed rule, and update the SQL, shared-helper, API-boundary, and live data-access tests.
**Resolution:** Partially repaired 2026-09-23. The rollout half is empty in fact: production holds 0 MFA factors and 0 AAL2 sessions, and no pre-037 token survives (newest session refresh was 2026-09-08), so no enrolled caller was ever authorized at AAL1. The live risk is the latent one the finding names second: the hook has been redefined in 002, 021 and 037, every existing hook test reads its own fixed migration file, so a fourth redefinition that dropped the claim would have passed CI and disabled enforcement silently. `apps/web/src/__tests__/access-token-hook-claims.test.ts` now resolves the newest definition of `custom_access_token_hook` and asserts it still mints every claim the app gates on, proven by a simulated regression that fails 8 of its 9 assertions. Still open: the fail-closed runtime rule. Deferred deliberately, because making an absent claim challenge-pending turns a future hook regression into a total denial of org access for every tenant, and that trade only pays once MFA is actually in use. Trigger to finish it: the first verified TOTP enrolment in production.
