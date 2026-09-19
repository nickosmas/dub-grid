# Feature: Share one realtime channel for mobile shift-request screens

**From build-plan:** feature 35
**Status:** verified

## Goal

`useMobileShiftRequestsRealtime` deliberately did not reference-count
(unlike web's `useOrgRealtimeInvalidation`), so the Schedule and Requests
screens (and any other caller) each opened their own `shift_requests`
Supabase channel and independently refetched on the same DB change. The
plan asked to promote it to a shared, reference-counted subscription.

## The fix

The hook now keeps a module-level registry keyed on the organization, the
same shape as web's `acquireOrgSubscription`:

- The first mount for an org opens the channel; later mounts join it; the
  last unmount closes it. A double-release guard keeps a repeated React
  cleanup from decrementing a count another screen still holds.
- Because every caller supplies its own `onChange`, the registry fans each
  event (and each reconnect-after-error) out to a `Set` of listeners,
  iterated over a snapshot so a listener that unmounts a sibling cannot
  mutate the set mid-loop.
- `onChange` moved into a ref. It used to sit in the effect's dependency
  list, so a screen handing in a new callback identity tore the channel
  down and re-opened it; now the subscription is keyed on the org alone
  and the latest callback is read at event time.

`createRealtimeChannelName` is kept for the one channel that is opened
per org, so the StrictMode/remount collision it exists for stays covered.

## Tests

`useMobileShiftRequestsRealtime.test.ts`, 7/7. The four existing cases
are kept (each now unmounts, since the registry outlives a render), plus:

- two simultaneous mounts open one channel; an event reaches both
  listeners; the first unmount leaves the channel up for the second; the
  second unmount closes it
- a changed `onChange` identity keeps the channel and routes events to the
  new callback
- different organizations get separate channels

Mobile `tsc --noEmit` clean, eslint and prettier clean, and the
shift-request and schedule screen suites that consume the hook green
(66/66).

## Files / areas

- `apps/mobile/src/features/shift-requests/hooks/useMobileShiftRequestsRealtime.ts`
- `apps/mobile/src/features/shift-requests/hooks/useMobileShiftRequestsRealtime.test.ts`

## Notes

The plan mentioned a Team tab as a third caller; in the current tree the
hook has two call sites (`ScheduleScreen`, `RequestsScreen`). The
registry handles any number, so a third caller joins the same channel
with no further change.
