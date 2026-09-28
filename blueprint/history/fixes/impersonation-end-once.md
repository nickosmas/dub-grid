# Fix: A concurrent impersonation end is recorded once

**Type:** Fix
**Status:** verified
**Fixes:** F-26

## The problem

The portal's end route (`app/api/gridmaster/impersonation/route.ts`) reads the session, then calls `end_impersonation`, whose second call for the same session is a silent no-op. Two concurrent ends both pass the read, so both write `impersonation.ended` and, since 41c3, both send the end notice email.

## The fix

- Migration `071_end_impersonation_reports_end.sql`: `end_impersonation` returns `BOOLEAN`, true only when its `UPDATE` ended the row. The body is 060's with the returns added (058's expiry end time and 060's escape audit row unchanged). A return type cannot change in place, so the function is dropped and recreated with its grants (`authenticated`, `service_role`; not `anon`). Callers that ignore the result (the middleware escape, sign-out) are unaffected.
- The route answers 404 "That viewing session has already ended." and records and announces nothing when the call returns `false`. A `null` result (a database before 071) still counts as ended, so deploy order cannot break ends.
- The live tests for 058 and 060 re-run their own files inside a rolled-back transaction; they now drop the function first, since `CREATE OR REPLACE` cannot change the return type back.

## Build steps

1. **Migration, route and tests** - as above; checksum locked.
   - Done when: `migration-071-end-impersonation.integration.test.ts` shows true then false for two ends with one set of notices, 060's single escape row, 058's end time and the grants; the route test for a `false` result records and announces nothing; the 058 and 060 live tests still pass.

## Verify

- The three impersonation live tests and `src/app/api/gridmaster/impersonation` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Production

071 follows 069 and 070 in the next release, through the runbook.

## Evidence

- `npm run db:migrations:check`: 71 contiguous files, 071's checksum locked.
- `migration-071-end-impersonation.integration.test.ts` (5), `impersonation-escape-audit` (4) and `impersonation-expired-end` (3) pass; `src/app/api/gridmaster/impersonation` (23) passes with the new `false` case.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,278), `npm run test:mobile` (1,401) and the live suite (34 files, 166 tests) pass.
- Production: not applied. 071 follows 069 and 070 in the next release, through the runbook.
