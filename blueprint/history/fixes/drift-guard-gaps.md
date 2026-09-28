# Fix: Close the remaining drift-guard gaps

**Type:** Fix
**Status:** verified
**Fixes:** F-50

## The problem

Five places where a copy can drift from its source without a test noticing:

1. `invitation-sql-contract.test.ts` checks a hand-copied list of the messages the invitations route matches after `replace_pending_invitation_access`, so a message the route starts matching is never checked against the SQL.
2. The claim-type check covers `JWTClaims` and `MobileAuthClaims` but not `VerifiedClaims` (`lib/auth/verify-token.ts`) or `api-auth`'s `Claims`, which add the server-derived `in_sandbox`.
3. The invite email and the landing page write "72 hours" rather than `INVITATION_LIFETIME_HOURS`.
4. The new tests resolve the repository as `process.cwd()/../..`, so they break when run from the repository root.
5. `push-auth-templates.test.ts` builds its expected fields from the script's own naming, so a field name the Management API does not accept would pass.

## The fix

1. Read the matched strings from the route's `replace_pending_invitation_access` error handling and require each to be raised by the function's latest definition.
2. Add both types to the claim check, with Supabase's own claims (`phone`, `is_anonymous`, `app_metadata`, `user_metadata`) as standard and `in_sandbox` as server-derived.
3. Derive the email and landing copy from the constant; the rendered text is unchanged.
4. A `repoRootDir()` helper beside `supabaseMigrationsDir()`, used by the three tests.
5. A fixture listing the `mailer_*` properties of `UpdateAuthConfigBody` from the Management API schema (read 2026-09-28), and a test that every field the push can write is in it.

## Build steps

1. **Drift guards** - the five changes above.
   - Done when: the three tests pass from `apps/web` and from the repository root, and the invite email and landing tests pass unchanged.

## Verify

- `npx vitest run src/__tests__/invitation-sql-contract.test.ts src/__tests__/access-token-hook-claims.test.ts src/__tests__/push-auth-templates.test.ts` in `apps/web`, and the same files with `--config apps/web/vitest.config.mts` from the root.
- Full gates: type-check, test:web, test:mobile, lint.

## Evidence

- `invitation-sql-contract`, `access-token-hook-claims` and `push-auth-templates` (21 tests) pass from `apps/web` and from the repository root; the invite email and landing tests pass with the rendered copy unchanged.
- `npm run type-check`, `npm run lint` (0 errors) and `npm run test:mobile` (1,401) pass. `npm run test:web`: 5,254 of 5,255 pass; the one failure was a deadlock in `gridmaster-direct-writes.integration.test.ts` under parallel load (a known flake another session is fixing), which passes alone (4/4).
