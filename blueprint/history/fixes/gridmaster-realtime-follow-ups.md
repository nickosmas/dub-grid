# Fix: Gridmaster realtime follow-ups

**Type:** Fix
**Status:** verified
**Fixes:** F-107

## The problem

- `invalidateGridmasterRealtimeQueries` (`hooks/useGridmasterRealtimeInvalidation.ts:267`) has no caller since F-83 moved the hook to the batcher; only its re-export in `hooks/index.ts` remains.
- `createDebouncedTableFlusher` (`packages/realtime-core`) has no disposed state, so an event that arrives while the channel is still leaving can arm one flush after teardown. The org hooks share it.
- The Gridmaster realtime test's `fire` uses `listener?.onEvent`, so a table dropped from the subscription would make the teardown test pass without firing anything, and `onReconnectAfterError` is untested.

## The fix

- Delete the dead export and its re-export.
- The flusher records `disposed`: `dispose()` clears pending tables and ignores later `markChanged` calls. Behaviour before dispose is unchanged.
- `fire` throws when the table has no listener; new tests cover the reconnect hook (one invalidation of `gridmaster.all()`) and a disabled hook subscribing to nothing.

## Build steps

1. **Flusher, export, tests** - the three changes above.
   - Done when: the flusher test "ignores changes that arrive after dispose" and the two new hook tests pass, and nothing references `invalidateGridmasterRealtimeQueries`.

## Verify

- `npx vitest run` in `packages/realtime-core`; `npx vitest run src/__tests__/gridmaster-realtime-invalidation.test.ts` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint.

## Evidence

- `packages/realtime-core` (20 tests, new "ignores changes that arrive after dispose") and `gridmaster-realtime-invalidation.test.ts` (25, new reconnect and disabled cases) pass.
- `npm run type-check`, `npm run lint` (0 errors), `npm run test:mobile` (1,406) pass. `npm run test:web`: 5,227 pass; the only failures are the three live schedule-notes files (`draft-state-editor-only`, `schedule-notes-leave-with-shift`, `schedule-notes-per-shift`), which fail because the shared local database already has migration 068 from `fix/note-dots-and-attribution` applied; that commit carries their updates.
