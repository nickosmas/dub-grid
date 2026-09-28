# Fix: Drop the schedule_notes indexes the unique key serves

**Type:** Fix
**Status:** verified
**Fixes:** F-108

## The problem

`idx_schedule_notes_emp (emp_id)` and `idx_schedule_notes_emp_date (emp_id, date)` (`001_schema.sql:1394`) both lead with `emp_id`, as 063's `schedule_notes_segment_unique (emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id)` does. Every note write maintains two indexes no query needs.

## The fix

- Migration `070_schedule_notes_redundant_indexes.sql` drops both. Checked first on the local stack with sequential scans off: without them, a read by person and a read by person and date range both plan as an index scan on `schedule_notes_segment_unique`, with `emp_id` (and the date range) in the index condition. `idx_schedule_notes_org_date` (062) and `idx_schedule_notes_indicator_type_id` stay. 068 changes no index, so there is no overlap.
- A live test runs 070 from its file in a rolled-back transaction (taking the table lock first) and asserts the indexes are gone, the unique key and organization-date index remain, and both reads plan on the unique key.

## Build steps

1. **Migration and live test** - as above; checksum locked.
   - Done when: `db:migrations:check` lists 70 contiguous files and `migration-070-schedule-notes-indexes.integration.test.ts` passes.

## Verify

- `npx vitest run --config vitest.config.mts src/__tests__/migration-070-schedule-notes-indexes.integration.test.ts` in `apps/web`.
- Full gates: type-check, test:web, test:mobile, lint, and the live integration suite.

## Production

070 follows 069 through the release runbook and must be applied before the release that carries it merges.

## Evidence

- `npm run db:migrations:check`: 70 contiguous files, 070's checksum locked.
- `migration-070-schedule-notes-indexes.integration.test.ts` (3) passes.
- `npm run lint` (0 errors), `npm run test:web` (5,272), `npm run test:mobile` (1,401) and the live suite (33 files, 161 tests) pass. `npm run type-check` first failed on a regular-expression flag the web target does not allow; it passes after the fix.
- Production: not applied. 070 follows 069 in the next release, through the runbook.
