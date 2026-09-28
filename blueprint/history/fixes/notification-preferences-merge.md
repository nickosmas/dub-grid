# Fix: Notification preferences merge in one database step

**Type:** Fix
**Status:** verified
**Fixes:** F-20

## The problem

`saveNotificationPreferences` (`features/account/server/preferences.ts:31`) reads the stored map, merges the incoming categories over it and upserts the result. A mobile save and a web save at the same moment can each overwrite the other's categories.

## The fix

- Migration `072_notification_preferences_merge.sql`: `merge_notification_preferences(p_user_id, p_prefs)` does the insert-or-merge in one `INSERT ... ON CONFLICT (user_id) DO UPDATE SET prefs = (stored.prefs || EXCLUDED.prefs) - 'security'`, under the row lock the conflict takes, and returns the stored map. The merge stays shallow, by top-level category, as the app's was, and security is never stored. Service role only (`PUBLIC`, `anon` and `authenticated` revoked).
- `saveNotificationPreferences` calls it and returns its result. Both callers (web route, mobile profile route) are unchanged.
- A live test proves the merge and the security rule inside a rolled-back transaction, the grants, and that two concurrent saves on separate connections keep both categories (a throwaway user id, removed afterwards).

## Build steps

1. **Migration, save and tests** - as above; checksum locked.
   - Done when: the live test and `preferences.test.ts` pass, and the web and mobile preference route tests pass unchanged.

## Verify

- `npx vitest run --config vitest.config.mts src/__tests__/migration-072-notification-preferences.integration.test.ts src/features/account/server/preferences.test.ts` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, the live suite.

## Production

072 follows 069 to 071 in the next release, through the runbook. The app must not ship before 072 is applied: without the function a save fails.

## Evidence

- `npm run db:migrations:check`: 72 contiguous files, 072's checksum locked; 072 applied to the local stack.
- `migration-072-notification-preferences.integration.test.ts` (3, including two concurrent saves on separate connections) and `preferences.test.ts` (2) pass; the web preference route (9) and mobile profile route (29) tests pass unchanged.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:web` (5,280), `npm run test:mobile` (1,401) and the live suite (35 files, 169 tests) pass.
- Production: not applied. 072 follows 069 to 071 in the next release, and must be applied before the app that calls it ships.
