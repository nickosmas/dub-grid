# Fix: A timed-out sign-in record is asked for once more

**Type:** Fix
**Status:** verified
**Fixes:** F-130

## The problem

Since F-127, `recordSignInOnce` answers `false` when its `record_sign_in_once` call runs past the one-second deadline, so the caller does not write a duplicate. If that abandoned call never reaches the database, the sign-in is never recorded.

## The fix

- On a `TimeoutError`, call `record_sign_in_once` once more. Under 073's advisory lock the second call waits for the first if it reached the database and then finds its row, or writes the only row if it did not, so the retry neither duplicates nor loses. A second timeout answers `false`; a returned error still answers `null`, and the caller then writes directly.
- `recordCompletedSignIn`'s docstring says `false` can mean a record still in flight.
- Two tests replace F-127's: a timeout followed by a recorded retry, and two timeouts answering `false` after exactly two calls.

## Build steps

1. **Retry and tests** - as above.
   - Done when: `npx vitest run src/lib/auth src/app/api/auth` passes and the retry case fails against the previous code.

## Verify

- `npx vitest run src/lib/auth src/app/api/auth` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Evidence

- `npx vitest run src/lib/auth src/app/api/auth` (202) passes; the retry case fails against 1953a44d, which called once.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,300), `npm run test:mobile` (1,402) and the live suite (37 files, 176 tests) pass at c042504f; the review's two notes (log level, docstring) then pass `src/lib/auth` and `src/app/api/auth` (202), type-check and lint.
- Independent `/audit` re-review of c042504f: closed.

## Findings

### sign-in-timeout-retry/F-127 [P3] closed - A sign-in record that runs past its deadline is written again by the fallback

**File:** `apps/web/src/lib/auth/security-audit.ts:89` (`recordSignInOnce`); `apps/web/src/lib/auth/sign-in-completion.ts:78`
**Found:** 2026-09-28 by an independent `/audit` re-review of F-25
**Why it matters:** `withTimeoutOrThrow` abandons the RPC without cancelling it, so on a timeout `recordSignInOnce` answered null and `recordCompletedSignIn` wrote directly while the RPC could still commit its own row: two success rows for one call, most likely under the load F-78 observed.
**Suggested fix:** Fall back only on a returned error, not on a timeout; test an RPC that settles after the deadline.
**Resolution:** Fixed in fix/audit-follow-ups: a `TimeoutError` answers false (the call is still running and records), so only a returned error falls back to the direct write. A test holds the RPC past its deadline and asserts no direct write. Closed 2026-09-28 by an independent `/audit` re-review of 1953a44d: `TimeoutError` is the class `withTimeoutOrThrow` rejects with (one module), `false` skips the direct write in `recordCompletedSignIn`, and the new test fails on the previous code. The test's `insert` assertion could not fail at that level; the guarantee is the `false` case in `sign-in-completion.test.ts`. Its residual risk, a timed-out call that never records, is F-130.

### sign-in-timeout-retry/F-128 [P3] closed - An element Button label scales to 1.5x instead of the compact 1.2x

**File:** `apps/mobile/src/shared/components/Button.tsx:260`
**Found:** 2026-09-28 by an independent `/audit` re-review of F-113
**Why it matters:** 2ac009c3 moved element labels to a plain `Text` with `maxFontSizeMultiplier={MAX_FONT_SCALE}` and no `fit`, so they could grow to 1.5x where every button label is capped at `MAX_FONT_SCALE_COMPACT`. Latent: no caller passes an element label.
**Suggested fix:** `fit="compact"` on that `Text`, asserted in `Button.test.tsx`.
**Resolution:** Fixed in fix/audit-follow-ups: the `Text` takes `fit="compact"`. The native test stub now exposes `maxFontSizeMultiplier` as `data-max-font-size-multiplier` (it dropped the prop), and the element-label test asserts 1.2; it fails against 2ac009c3's `Button`. Closed 2026-09-28 by an independent `/audit` re-review of 1953a44d: `fit="compact"` caps the multiplier at 1.2 (the size ceiling does not bind at 15pt), `fitProps` and `FIT_STYLE` only repeat what the label already sets, the stub's new `data-*` attribute breaks no other mobile test (63 related tests pass), and the assertion fails on 2ac009c3's `Button`.

### sign-in-timeout-retry/F-129 [P3] closed - 074's header says it records an invitation's first password

**File:** `supabase/migrations/074_password_change_recorded.sql:8`; `blueprint/history/fixes/password-change-recorded.md:13`
**Found:** 2026-09-28 by an independent `/audit` re-review of F-05
**Why it matters:** The normal invitation path creates the user with its password (an insert), so the update trigger does not fire; only the abandoned-unconfirmed branch (`updateUserById`) is recorded. The behaviour is right (a first password is not a change), but the checksum-locked header and the archive claim otherwise.
**Suggested fix:** Correct the wording while 074 is unapplied on production, or at least correct the archive.
**Resolution:** Fixed in fix/audit-follow-ups: the archive now names the paths the trigger records and says the header overstates the invitation path. 074 itself is left unchanged: it was already on origin/dev and may be in the production rehearsal, and changing a checksum-locked file under that would do more harm than the comment. Closed 2026-09-28 by an independent `/audit` re-review of 1953a44d: the corrected archive matches the code (the normal invitation path inserts the user; only the abandoned-unconfirmed branch updates a password), and leaving the checksum-locked 074 unchanged on origin/dev is acceptable for a comment-only misstatement.

### sign-in-timeout-retry/F-130 [P3] closed - A sign-in record whose call times out and never reaches the database is lost

**File:** `apps/web/src/lib/auth/security-audit.ts:86` (`recordSignInOnce`)
**Found:** 2026-09-28 by an independent `/audit` re-review of F-127 (unverified there)
**Why it matters:** After F-127 a timed-out call answers `false` and nothing more is written. If the abandoned call never reaches Postgres (connection setup still pending under load) or the function is frozen after the response, the sign-in is not recorded at all. Audit completeness only.
**Suggested fix:** On a timeout, call the idempotent, lock-guarded `record_sign_in_once` once more: it either finds the first call's row or writes the only one.
**Resolution:** Fixed in fix/sign-in-timeout-retry: a timeout asks once more; a second timeout answers `false` without a direct write, and any returned error still answers `null` for the caller's fallback. `recordCompletedSignIn`'s docstring now says `false` can mean a record still in flight. Tests: a first call past its deadline followed by a recorded retry (fails against 1953a44d, which called once), and two timeouts answering `false` after exactly two calls. Closed 2026-09-28 by an independent `/audit` re-review of c042504f: at most two attempts, every exit returns; under 073's lock the retry either finds the first call's row or writes the only one, whatever order they reach the database; a first timeout followed by a returned error can still duplicate through the direct write, which the "twice beats losing" rule accepts; worst-case completion latency rises from about 1 s to 2 s, well inside the clients' 15 s. Its two notes are applied: a recovered first timeout logs at warn rather than error (asserted), and `recordCompletedSignIn`'s docstring says `false` means not known to have recorded. Its unverified note, a retry doubling connection use when the database is already slow, is bounded at two and needs no change unless load testing shows pool pressure.
