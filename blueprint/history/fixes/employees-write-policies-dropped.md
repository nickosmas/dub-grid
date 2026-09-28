# Fix: Staff records keep no admin write policy

**Type:** Fix
**Status:** verified
**Fixes:** F-109

## The problem

065 revoked `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` and `TRIGGER` on `public.employees` from `authenticated`, so `admin_insert_employees`, `admin_update_employees` and `admin_delete_employees` (`003_rls_policies.sql:273`) grant nothing today. Any later broad grant, as 004's `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`, would bring them back into force and silently reopen F-100. The revoke also left `MAINTAIN`, and 065's header omits `purge_expired_data` from the SECURITY DEFINER writers.

## The fix

- Migration `069_employees_admin_write_policies_dropped.sql`: drop the three policies and revoke `MAINTAIN` from `authenticated`. `gridmaster_all_employees` stays, behind 054's fresh-proof restrictive policies; reading is unchanged. The header records `purge_expired_data`.
- A live case in `row-level-trust-boundaries.integration.test.ts` runs 069 from its file in a rolled-back transaction and asserts: no write privilege for `authenticated` (including `MAINTAIN`); the only permissive write policy left is the Gridmaster one; and, with `UPDATE, DELETE` granted back as 004 once did, an Admin with `canManageEmployees` updates and deletes nothing.

## Build steps

1. **Migration and live test** - as above; checksum locked.
   - Done when: `npm run db:migrations:check` lists 69 contiguous files and the live case passes.

## Verify

- `npx vitest run --config vitest.config.mts src/__tests__/row-level-trust-boundaries.integration.test.ts` in `apps/web` against the local stack.
- Full gates: type-check, test:web, test:mobile, lint.

## Production

069 reaches production only through the runbook: a scratch local stack at production's ledger, inspector `--local` matching production, dry run, apply, `--expect-complete`, then the owner's `npx supabase db push --linked`. It must be applied before the release that carries it merges, after 067 and 068.

## Evidence

- `npm run db:migrations:check`: 69 contiguous files, 069's checksum locked.
- `row-level-trust-boundaries.integration.test.ts` (10) passes; its new case takes the `employees` lock first, since dropping a policy takes it anyway.
- The live suite (`npx vitest run --config vitest.config.mts integration.test.ts` in `apps/web`): 32 files, 158 tests pass.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:mobile` (1,401) pass. `npm run test:web`: 5,253 of 5,256; the three failures (`auto-approve-shift-requests`, `mfa-enforced-in-policies` (F-18), `row-level-trust-boundaries`) were deadlocks and a known flake under parallel load, and each passes alone.
- Production: not applied. 069 follows 067 and 068 through the release runbook.
