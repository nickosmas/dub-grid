# Fix: Gridmaster realtime refreshes once per burst, not once per row

**Type:** Fix
**Status:** verified
**Fixes:** F-83

## The problem

`useGridmasterRealtimeInvalidation` subscribes to every organization's rows and
invalidates the matching query keys on each `postgres_changes` event, with no
batching. A bulk import, an invitation batch or a large publish in any
organization emits one event per row, so an open Gridmaster page (a person
page, the dashboard, the overview, an organization's health) refetches once per
row, and each invalidation is also broadcast to every other tab once per row.
The per-organization hook (`useOrgRealtimeInvalidation`) already coalesces its
bursts with a 150 ms debounce; the Gridmaster hook never did.

## The fix

Batch by query key, not by table: the keys a Gridmaster event invalidates
depend on the table and on the row's organization and person, and many tables
share keys (`overview`, `dashboard`, `orgHealth`).

- Each event resolves its keys exactly as today
  (`getGridmasterRealtimeInvalidationKeys`, unchanged) and marks them changed
  on the shared `createDebouncedTableFlusher` from `@dubgrid/realtime-core`,
  keyed by the serialized query key, with the org hook's 150 ms window.
- On flush, each distinct key is invalidated and broadcast once, so a burst
  touching ten tables still refetches `overview` once.
- The flusher is disposed when the subscription is torn down, so a pending
  flush never fires after the portal unmounts or a Gridmaster signs out.
- Unchanged: which keys a change invalidates, the reconnect-after-error full
  invalidation (immediate, not batched), the channel and its tables, and
  `invalidateGridmasterRealtimeQueries` for any direct caller.

No new dependency and no local debounce: the timer logic stays in
`realtime-core`.

## Build steps

- [x] **Step 1 - coalesce the Gridmaster subscription** - route events through
      the shared flusher keyed by serialized query key, flush each key once,
      dispose on teardown; test with fake timers. _Done when:_ a test fires a
      burst of events across tables and organizations and sees each distinct
      key invalidated and broadcast exactly once after 150 ms and none before;
      a test sees nothing invalidated after teardown; the existing key-mapping
      tests still pass; `npm run type-check`, `npm run test:web` and
      `npm run lint` pass. _Done 2026-09-28:_ 23/23 in the file (4 new);
      removing the teardown dispose or restoring the per-event refresh each
      fails a test; type-check, lint (0 errors) and `test:web` (5141 tests,
      `realtime-core` 19) pass. `createDebouncedTableFlusher` is now exported
      from `@dubgrid/realtime-core` rather than duplicated.

## Verify

- Unit: the burst and teardown tests above.
- Manual (optional): as a Gridmaster with a person page open, bulk-import
  staff into any organization; the network panel shows one refetch of the
  person and summary queries per burst instead of one per imported row.
