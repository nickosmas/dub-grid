# Fix: A completed sign-in is recorded once, atomically

**Type:** Fix
**Status:** verified
**Fixes:** F-25

## The problem

`recordCompletedSignIn` (`lib/auth/sign-in-completion.ts:61`) asks `hasRecordedSignIn` whether the Auth session already has its success row, then writes one. Two concurrent completion calls can both read nothing and both write. The clients guard against concurrent calls, but the server does not.

## The fix

- Migration `073_record_sign_in_once.sql`: `record_sign_in_once(p_actor_id, p_org_id, p_details)` takes a transaction advisory lock on the person and session hash, checks for a successful `security.auth.login` or `security.auth.mfa` row with that hash (the same rule `hasRecordedSignIn` applied), and inserts the row `writeSecurityAuditEvent` would write when there is none. It returns whether it recorded. A lock, not a unique index, because existing rows may already hold duplicates and history is not rewritten. It refuses a call without a person or session hash. Service role only.
- `recordSignInOnce` replaces `hasRecordedSignIn` in `security-audit.ts`. It returns null when the call fails, and `recordCompletedSignIn` then writes directly, keeping the rule that recording a sign-in twice beats losing it. A session without an id is still written directly.
- The live test covers first-only recording, a reauthentication's row counting as recorded, the refusal, the grants, and two racing calls on separate connections leaving one row. Unit tests cover the new writer and both completion routes.

## Build steps

1. **Migration, writer, completion and tests** - as above; checksum locked.
   - Done when: `migration-073-record-sign-in-once.integration.test.ts` passes, and the `lib/auth`, `app/api/auth` and mobile route tests pass.

## Verify

- `npx vitest run --config vitest.config.mts src/__tests__/migration-073-record-sign-in-once.integration.test.ts src/lib/auth src/app/api/auth` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Production

073 follows 069 to 072 in the next release. Before it is applied, the call fails and the app falls back to writing directly, as before.

## Evidence

- `npm run db:migrations:check`: 73 contiguous files, 073's checksum locked; 073 applied to the local stack.
- `migration-073-record-sign-in-once.integration.test.ts` (4, including two racing calls on separate connections) passes, with `lib/auth`, `app/api/auth` and the mobile routes (419 in all).
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,286), `npm run test:mobile` (1,401) and the live suite (36 files, 173 tests) pass.
- Production: not applied. 073 follows 069 to 072 in the next release; until it is applied the call fails and the app writes directly, as before.
