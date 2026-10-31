# Fix: A cold open shows the last session's Home while it refreshes

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-31
**Branch:** `fix/mobile-persisted-cache-v2`
**Fixes:** F-181

Step 7 of the sign-in and cold-open speed fix
(`sign-in-cold-open-speed.md`), held back until the Dependency Audit gate
was green (`dependency-audit-gate-october.md`, #234).

### The fix

- Adds `@react-native-async-storage/async-storage` 2.2.0 (Expo SDK 54's
  pin), `@tanstack/query-async-storage-persister` and
  `@tanstack/react-query-persist-client` 5.101.4, pinned to the installed
  React Query so it does not move. The owner chose AsyncStorage
  (2026-10-30).
- `apps/mobile/src/shared/lib/query-persistence.ts`: persists only the
  bootstrap and the queries Home opens with (`shouldPersistQuery`), for 24
  hours, under a buster of the app version and a schema number.
  `clearQueryCache()` also removes the stored copy, and replaces
  `queryClient.clear()` in `AuthSessionProvider`, `auth-reset` and
  `ProfileScreen`.
- `warmStartup()` restores the stored queries at launch; a fresher network
  answer always replaces a restored one.

### Verification evidence

- Lockfile: nine new entries (the three packages and their dependencies),
  resolved with npm 10.9.2 and `--before=2026-10-24`; a second lock-only
  install leaves it byte-identical. `deps:audit` passes (16 allowlisted),
  the freshness scan is clean.
- Clean install, then `npm run type-check`, `npm run lint` and
  `npm run test:mobile` (1,547 tests) pass.
- Not seen on a device: AsyncStorage is a native module, so it needs a new
  development build, and the store release is on hold.
