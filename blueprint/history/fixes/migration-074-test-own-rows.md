# Fix: The 074 password-change test counts only its own audit rows

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-20

### The problem

`apps/web/src/__tests__/migration-074-password-change-recorded.integration.test.ts`
runs migration 074 inside BEGIN/ROLLBACK and checks the audit rows its trigger
writes. `passwordRows()` selected every `security.auth.password` row for
qa-regular@dubgrid.test, so any earlier real password change for that account
counted too.

On 2026-10-20 an owner-approved local reseed (`FORCE_LOCAL_DB=1 npm run seed`)
re-set the QA passwords on the existing database, which fired the 074 trigger
and left a permanent row for qa-regular (id 2012, 20:24:58). From then on two
cases failed with one row too many, although the trigger was correct. The fix
belongs in the test, not the data: the row is a true record and stays.

### The fix

Landed in 116f9d70. `passwordRows()` also requires `created_at >= now()`.
`audit_log.created_at` defaults to `now()` (001), and inside a transaction
`now()` is the transaction's start, so the trigger's rows carry that value and
rows from earlier commits never match.

A parallel branch (fix/migration-074-test-own-rows) made the same change with
`created_at = now()`, which would also leave out a change another session
commits while a case runs. It was dropped in favour of the commit already on
`dev`: that race needs a password change for qa-regular inside a few
milliseconds of a case, and nothing in the suite makes one.

### Build steps

- [x] **1. Scope the query to the test transaction.** Done when the file
      passes 3/3 against the local database holding the stray row, and still
      fails if the trigger records twice or records an unchanged password.

### Verification

With the stray row in the local database:

- Before the fix (01a7c3c7): 2 failed, 1 passed.
- After (116f9d70): 3/3 on three consecutive runs.
- Mutants, each a temporary copy of the test applying an altered 074: a second
  insert in the trigger function fails "records a new password once"; dropping
  the trigger's `WHEN` guard fails "records nothing when the password is
  written back unchanged". Both copies were deleted.
- The stray audit row is still present after the runs.
- `npm run type-check` (24/24) and `npm run build` passed on the parallel
  branch, whose only difference in code was `=` for `>=` in this test.

### How to try it

From `apps/web`:

```bash
npx vitest run src/__tests__/migration-074-password-change-recorded.integration.test.ts
```

It needs the local Supabase stack running; without it the suite is skipped.
