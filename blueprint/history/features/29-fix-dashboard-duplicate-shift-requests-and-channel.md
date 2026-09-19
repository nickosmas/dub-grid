# Feature: Fix dashboard duplicate shift-requests fetch and realtime channel

**From build-plan:** feature 29
**Status:** verified

## Goal

`DashboardView` fetched shift requests twice for the same period: once
directly inside its main data effect (all statuses, for the activity feed)
and again through `useShiftRequests` (open and pending, for pending
approvals). `useShiftRequests` also opened its own raw
`createBrowserRealtimeChannel` on `shift_requests` per mount, on top of
the shared, reference-counted `useOrgRealtimeInvalidation` channel that
already invalidates on that table, reintroducing the per-hook-channel
problem that helper was built to remove.

## The fix

- `useShiftRequests` now keeps its rows in react-query under
  `queryKeys.shiftRequests.all(orgId)` plus its window, status scope and
  label-map key. That prefix is exactly what the shared org channel
  invalidates on a `shift_requests` change, so the hook's own channel is
  gone. `refetch` refetches the query; the mutation helpers invalidate the
  prefix instead, so a sibling instance (the dashboard's all-status window
  beside the schedule page's active list) refreshes from the same mutation.
- New `includeAllStatuses` option: fetch every status in the window and
  expose it as `allRequests`, while `requests` and the derived lists still
  hold only active ones (`resolveActiveShiftRequests` already drops the
  settled statuses). The dashboard passes it and reads its activity feed
  from `allRequests`, so its direct fetch and `activityRequests` state are
  removed - one request serves both the feed and pending approvals.
- The shared channel's reconnect-after-error handler now also invalidates
  the shiftRequests prefix, preserving the refetch the hook used to do on
  its own reconnect.

## Measured

Dashboard entry as `qa-super-admin`, before and after under identical
conditions (baseline taken by stashing the change):

|                                     | before               | after               |
| ----------------------------------- | -------------------- | ------------------- |
| `/api/schedule/requests` fetches    | 4                    | **1**               |
| realtime joins for `shift_requests` | 3 (shared + two raw) | **1** (shared only) |

## Tests

- `useShiftRequests.test.tsx` (6/6): existing cases rewrapped in a
  `QueryClientProvider` with a flush that also runs pending timers
  (react-query batches notifications on a timer and the suite uses fake
  timers); new cases assert no raw channel is opened and that
  `includeAllStatuses` drops the status filter while `requests` stays
  active-only.
- `UserDashboard.test.tsx` fixture carries `allRequests`.
- Web `tsc --noEmit`, eslint and prettier clean; hooks and dashboard
  suites 119/119; `dashboard-states`, `schedule`, `schedule-states`,
  `role-variance` and `role-variance-admin` e2e green (14 passed).

## Files / areas

- `apps/web/src/hooks/useShiftRequests.ts`
- `apps/web/src/hooks/useOrgRealtimeInvalidation.ts`
- `apps/web/src/components/dashboard/DashboardView.tsx`
- `apps/web/src/__tests__/useShiftRequests.test.tsx`
- `apps/web/src/components/dashboard/__tests__/UserDashboard.test.tsx`
