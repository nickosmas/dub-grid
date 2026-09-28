# Fix: A password change is recorded by the database

**Type:** Fix
**Status:** verified
**Fixes:** F-05

## The problem

The only record of a password change was the global sign-out that follows it, labelled "Changed their password and signed out everywhere" from a `reason` the client sends (`lib/auth/session-sign-out.ts:28`). Any assured user could record a password change without making one, and a change whose sign-out failed left no record. The ledger's suggested fix, recording the change independently of the client, was tied to the open 41b2/F-08 decision about credential changes that bypass DubGrid. Recording at the database settles both sides for the audit trail without deciding how changes are made.

## The fix

- Migration `074_password_change_recorded.sql`: an `AFTER UPDATE OF encrypted_password` trigger on `auth.users` (as 048's known-devices trigger) writes `security.auth.password` with the person as actor and resource, no organization, and `{outcome: succeeded, reason: password_changed}`, whenever the stored hash actually changes. It fires for every path: settings, recovery, an invitation's first password, or a direct Auth call. The recorder function is callable by no client role.
- The registry names that row "Changed their password". The client-labelled sign-out now reads "Signed out everywhere after a password change", which names only what the client could claim.
- The registry test lists the new trigger-written action; a live test covers one row per real change, none for an unchanged write, and no client grant.
- Known limit: an Auth-side rehash of an unchanged password would also be recorded. DubGrid's bcrypt hashes are not rehashed today.

## Build steps

1. **Migration, labels and tests** - as above; checksum locked.
   - Done when: `migration-074-password-change-recorded.integration.test.ts` and `audit-registry.test.ts` pass.

## Verify

- `npx vitest run --config vitest.config.mts src/__tests__/migration-074-password-change-recorded.integration.test.ts src/__tests__/audit-registry.test.ts` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Production

074 follows 069 to 073 in the next release, through the runbook.

## Evidence

- `npm run db:migrations:check`: 74 contiguous files, 074's checksum locked.
- `migration-074-password-change-recorded.integration.test.ts` (3) and `audit-registry.test.ts` pass.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,291), `npm run test:mobile` (1,401) and the live suite (37 files, 176 tests) pass.
- Production: not applied. 074 follows 069 to 073 in the next release, through the runbook.
