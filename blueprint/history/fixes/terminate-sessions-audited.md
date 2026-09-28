# Fix: A terminate whose session ending fails is still audited

**Type:** Fix
**Status:** verified
**Fixes:** F-101

## The problem

`POST /api/gridmaster/users/[userId]/terminate` calls `terminate_user_account`, which commits and writes no audit row, then `endUserSessions`, then the `user.terminated` audit row. When ending sessions fails, the route answers 500 before the audit write. A retry is refused with "This account is already terminated" (`021_platform_account_termination.sql:366`), so the termination is never recorded, and the Gridmaster is told it failed when it did not. The hook still refuses a terminated account's refresh, so the gap is the missing record, not access.

## The fix

- Once the RPC succeeds, the termination has happened: end sessions in their own `try`, log a failure, and always write the `user.terminated` row, with `sessionsEnded: true` or `false` in its details.
- Answer 200 with `sessionsEnded` either way, so the page reports what happened: a success toast, or a warning that the account is terminated but some devices may still be signed in, pointing at Force logout (which stays offered on a terminated account).
- An audit write that itself fails still answers 500, as today.
- Must not change: the RPC refusal path (400, nothing revoked or audited), CSRF, step-up, the order RPC then sessions.

## Build steps

1. **Route and page** - the route change above; `terminateGridmasterUser` returns `sessionsEnded`; the person view warns when it is false.
   - Done when: a route test where `endUserSessions` rejects answers 200 with `sessionsEnded: false` and writes the audit row with it; the success test records `sessionsEnded: true`; a view test shows the warning.

## Verify

- `npx vitest run "src/app/api/gridmaster/users/[userId]/terminate" src/__tests__/GridmasterPersonView.test.tsx` from `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint.

## Evidence

- `terminate/route.test.ts` (6) and `GridmasterPersonView.test.tsx` (32) pass; the new cases are `endUserSessions` rejecting (200, audited with `sessionsEnded: false`), the audit write failing (500), and the page's warning.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (600 files, 5,212 tests, live integration files included against the local stack) and `npm run test:mobile` (1,406 tests) pass.
