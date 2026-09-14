# Feature: Scheduler open-shift staffing

**From build-plan:** feature 22
**Status:** verified

## Goal

Let schedule editors click an open shift and staff it directly from the active,
qualified, conflict-free roster. The assignment must become an ordinary draft
schedule change and reach staff only through the existing publish workflow,
while people without schedule-edit permission keep the current claim and
volunteer experience.

## In scope

- A scheduler-only staffing dialog for both coverage-gap and calloff-backed open
  shifts on the web schedule.
- Candidate filtering to active staff who belong to the required focus area,
  satisfy the exact role and certification rules, have no absence that day, and
  have no overlapping worked segment.
- Support for candidates who already have non-overlapping work that day by
  appending the new segment instead of replacing their schedule cell.
- Exact assignment selection when a coverage gap can be filled by more than one
  qualified shift/job definition.
- Draft-aware open-shift counts so a newly staffed gap decrements or disappears
  immediately for every connected scheduler.
- Calloff open pickups remain open while the staffing change is a draft, reopen
  naturally if that draft is discarded, and close atomically when a matching
  staffing change is published.
- Clear loading, empty, stale, and write-failure behavior without exposing
  inactive or removed people.

## Out of scope

- Changing the regular-staff volunteer, claim, or approval workflow.
- Mobile schedule editing or publishing.
- Automatic staffing recommendations, ranking, bulk assignment, or autofill.
- Publishing immediately from the staffing dialog.
- Production migration execution; feature 24 remains the final release gate.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock candidate and merge contracts** - add pure helpers that
      resolve each active employee's qualified assignment options, exclude focus-area,
      absence, and time conflicts, and append a selected option to an existing
      non-overlapping worked draft. _Done when:_ focused tests cover inactive staff,
      focus-area mismatch, role/certification requirements including OR rules,
      absences, overlapping and adjacent times, multiple assignment options, and
      preservation of existing segments and custom times.
- [x] **Step 2 - Build the scheduler staffing dialog** - add a focused dialog
      that explains the opening, lists all eligible people with useful compact
      context, supports search and exact assignment selection, and uses standard
      equal-size adjacent actions with one-line labels. _Done when:_ component tests
      prove populated, empty, search, selection, disabled/submitting, and narrow
      states without changing the regular volunteer dialogs.
- [x] **Step 3 - Route scheduler clicks through the draft pipeline** - open the
      staffing dialog for schedule editors, revalidate the selected candidate at
      confirmation, merge through the existing `setShift` optimistic/versioned
      writer, and make open-shift counts react to matching drafts. _Done when:_ a
      scheduler click creates an ordinary draft, a non-overlapping existing shift is
      preserved, stale/conflicting selections are rejected, coverage needs update,
      and users without edit permission still enter the existing volunteer flow.
- [x] **Step 4 - Finalize calloff openings on publish** - add a retry-safe forward
      migration and baseline SQL so publishing a matching scheduler-staffed draft
      resolves the calloff pickup in the same transaction, while draft discard does
      not touch it. _Done when:_ SQL boundary tests prove org/date/focus/assignment
      matching, active-open-request-only behavior, target attribution, atomic publish
      closure, and no effect on regular pending volunteer requests.
- [x] **Step 5 - Verify the complete flow** - exercise the Calm Haven web schedule
      as an editor and as regular staff, then run the full project gates. _Done when:_
      authenticated browser evidence covers eligible, empty, merge, draft, discard,
      and publish behavior; unit/integration tests, type-check, lint, formatting, and
      production build all pass with no unexplained regression.

## Files / areas

- `apps/web/src/app/(app)/schedule/_lib/` - candidate, merge, and draft-coverage helpers.
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` - permission-aware click routing and draft integration.
- `apps/web/src/components/schedule/` - scheduler staffing dialog.
- `apps/web/src/__tests__/` and colocated tests - helper, dialog, routing, and regression coverage.
- `supabase/migrations/002_functions_triggers.sql` and a new forward migration - atomic calloff completion on publish.
- `apps/web/src/__tests__/publish-sql.test.ts` - SQL contract coverage.

## Data / contracts

- Candidate computation is client-side over the already authorized active roster,
  assignment definitions, and effective schedule map; it grants no new data access.
- A candidate carries an employee plus the exact assignment-definition IDs they
  can take. Coverage-gap IDs are alternatives; calloff segments are one exact set.
- Staffing writes an ordinary `ScheduleCellInput` draft through the existing
  authenticated, organization-scoped, optimistic `upsertShift` path.
- Existing worked cells are merged segment-for-segment with aligned custom-time
  pipes; absence cells are never converted implicitly.
- The database publish hook resolves only an `open` pickup with a non-null parent
  request whose organization, date, focus area, and complete assignment shape
  match the newly published staffing segment set. It records the target employee
  and publishing actor. It never resolves untargeted coverage volunteers or
  `pending_approval` requests.
- The forward migration is additive/retry-safe and is only prepared locally here;
  applying reviewed migrations to production remains feature 24.

## Testing

- Vitest: pure qualification/merge helpers, dialog behavior, schedule click
  routing, draft-aware counts, and SQL migration boundaries.
- Existing schedule and volunteer suites must remain green to prove regular staff
  behavior did not change.
- Playwright in Calm Haven: click a coverage gap and calloff as a scheduler;
  inspect candidate, empty, existing-non-overlap, draft, discard, and publish
  states; verify a regular user still sees Volunteer/Claim rather than Assign.
- Final gates: `npm run test`, `npm run type-check`, `npm run lint`, formatting
  check, `npm run build`, and the focused authenticated Playwright scenario.

## Notes for the AI

- `canEditShifts` defines the scheduler staffing path. Do not use broad open-shift
  visibility (`canManageEmployees`) as permission to write schedules.
- Reuse `isEmployeeQualifiedForAssignmentDefinition`, canonical time-overlap
  logic, `Modal`, shared buttons, and `setShift`; do not create parallel eligibility
  or persistence rules.
- Use the effective draft-visible schedule for editor filtering and revalidate
  immediately before writing. The server remains authoritative through permission,
  optimistic-version, and overlap constraints.
- Sort candidates deterministically by the schedule's active sort convention,
  then name as a stable tie-breaker; never hide valid candidates behind pagination.
- Preserve current open-shift labels on the grid and use full names in the dialog.
- Keep all text sentence case and all button labels on one line.
