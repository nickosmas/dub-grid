# Feature: Fix Reports page duplicate operations-report fetch

**From build-plan:** feature 30
**Status:** verified

## Goal

`ReportsPageContent` populated its five filter dropdowns by requesting the
**entire** operations report for the range with empty filters
(`targetOptionsQuery`), reading only `filterOptions` off it. Generating a
report with any non-empty filter then requested the entire report again
for the same range under a different query key. Every entry paid for a
full report computation to fill dropdowns, and every filtered generate paid
for it twice. The plan offered two fixes: a lightweight options-only
endpoint, or having the report query reuse the options query's
`filterOptions`.

## What was done

The first option, implemented as a mode of the existing route rather than
a second route, with one guarantee added: the dropdowns can never be built
from different data than the report itself.

- **Server** (`features/reports/server/operations.ts`)
  - `buildOperationsReportFilterOptions(source, rangeDates)` extracted as a
    pure function; `buildOperationsReportPayload` now calls it, so the
    full payload and the options-only payload share one definition.
  - `fetchFilterOptionSource(serviceClient, orgId)` holds the five lookups
    the options need (employees, focus areas, shift categories, jobs,
    indicator types). `loadOperationsReport` consumes them from that helper
    in place of its inline copies, and the employee column list became a
    shared constant, so the two loaders cannot drift.
  - New `loadOperationsReportFilterOptions(serviceClient, { orgId, range })`
    runs those five lookups and nothing else: no published rows, notes,
    requests, invitations or coverage, and no report computation.
- **Route** (`api/reports/operations`): `optionsOnly=1` in the query schema
  branches to the light loader after the same permission and feature-flag
  checks.
- **Client**: `fetchOperationsReportFilterOptions`, a new
  `queryKeys.reports.operationsOptions(orgId, start, end)` kept under the
  `operations` prefix so the existing realtime invalidation still reaches
  it, and `targetOptionsQuery` switched over. `optionsPayload` still falls
  back to `reportsQuery.data`, which carries the same `filterOptions`.

`filterOptions` is range-scoped, never filter-scoped (it is built from the
org's lookup tables, not from the filtered rows), which is what makes
serving it independently correct.

## Measured

Against the running app as `qa-super-admin`, response body of the
`/api/reports/operations` calls:

| call                   | before                | after                          |
| ---------------------- | --------------------- | ------------------------------ |
| page entry (dropdowns) | full payload, ~102 KB | **4,952 bytes** (options only) |
| generate               | full payload, ~102 KB | ~102 KB, unchanged             |

The entry request shrank by roughly 95% and no longer computes any report
rows; a filtered generate now costs one full report instead of two.

## Tests

- `operations.test.ts`: parity case asserting
  `buildOperationsReportFilterOptions` equals the full payload's
  `filterOptions` for the same source, and that applied employee/job
  filters do not shrink the offered options (25/25).
- `route.test.ts`: `optionsOnly=1` returns the options payload as
  no-store JSON, calls the light loader with the parsed range, and never
  calls the full loader (14/14).
- `reports-states.spec.ts`: the empty-state case's intercept now lets the
  options-only call through untouched (it has no `reports` to blank); 4/4
  in three consecutive runs.
- `ReportsPageContent.test.tsx`: its module mock for the reports client
  now provides `fetchOperationsReportFilterOptions` (the page's dropdowns
  came back empty without it, failing five scoping cases in the full
  suite), plus an entry assertion that only the options call is made and
  the full report waits for Generate (16/16).
- `tsc --noEmit` clean, eslint clean, prettier clean; full web unit suite
  3737/3737 after that mock fix.

## Files / areas

- `apps/web/src/features/reports/server/operations.ts`
- `apps/web/src/features/reports/server/operations.test.ts`
- `apps/web/src/features/reports/client/api.ts`
- `apps/web/src/app/api/reports/operations/route.ts`
- `apps/web/src/app/api/reports/operations/route.test.ts`
- `apps/web/src/app/api/reports/operations/params.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/app/(app)/reports/ReportsPageContent.tsx`
- `e2e/reports-states.spec.ts`
- `apps/web/src/app/(app)/reports/ReportsPageContent.test.tsx`
