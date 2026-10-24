# Fix: Job preferences beside shift preferences, in a stepped pop-up with Back

**Type:** Fix
**Status:** verified
**Branch:** `fix/auto-build-job-preferences` (cut from `fix/auto-build-fill-week` at 1f853587)

## Problem

The owner (2026-10-24): "when setting shift preferences: 1. The pop up should
allow navigating back so we don't have to close it to restart the selection 2. It should also allow for setting a job preference in the same manner e.g
we can set it so that a specific staff only does supervising".

## Decisions (owner, 2026-10-24)

- The pop-up has steps: first Shifts or Jobs, each row showing its current
  setting; then Any, Prefers or Only and the items. Back returns to the first
  step with the choices kept; Save saves both.
- Both apply: an Only rule (shift or job) rules out anything else, and a
  person is preferred for a shift that matches every preference they set.
- People > Recurring Shifts shows one Preferences column, such as "Only
  Supervisor · Prefers Day Shift", opening the pop-up.
- Released together with fix/auto-build-fill-week.

## Steps

- [x] **Step 1 - Table** - migration 091 adds `employee_job_preferences`,
      the same shape and lock-down as 089's shift preferences (service role
      only, RLS on with no policies), with job ids.
      _Done when:_ a live migration test proves the shape, checks, grants and
      cascade; the isolation test lists the table; `db:migrations:check`
      passes and a rehearsal from 090 applies it.
- [x] **Step 2 - Save and load** - the recurring route's preference actions
      read and save a job preference beside the shift one (jobs checked
      against the organization); the client API follows.
      _Done when:_ route tests cover fetch, save, clear and a job from
      another organization.
- [x] **Step 3 - Auto-build follows it** - availability refuses a job outside
      an Only job preference (`onlyJobs`, "works only their chosen jobs"),
      and the fairness standing matches only when every set preference does.
      _Done when:_ adapter and text tests cover both.
- [x] **Step 4 - Pop-up and column** - the stepped pop-up with Back, and the
      Preferences column.
      _Done when:_ component tests cover the steps, Back keeping choices, and
      saving both; a browser check on Calm Haven saves a job preference and a
      build follows it.
- [x] **Step 5 - Docs** - the recurring shifts guide and the Auto-build guide.

## Checks

- Migration 091: live test (4), the isolation test's policyless list, and
  `db:migrations:check`; `db:migrations:rehearse -- --from 090` applied and
  qualified it on a throwaway stack. Applied to the shared local stack.
- Route tests for fetch, save (deduplicated, checked against the
  organization's jobs) and a foreign job; the impersonation test lists
  `fetchJobPreferences` as a read. Adapter tests for Only and Prefers jobs,
  with a shift preference; the `onlyJobs` reason text. Pop-up tests for the
  start step, Back keeping choices, Save off while a step needs an item, and
  clearing with Any. 521 web and 287 schedule-core tests pass;
  `npm run type-check` (web), eslint, prettier, `docs:check:closed` after
  the inventory and fingerprints.
- Headless browser on Calm Haven: William Harper's Preferences went from
  "No preference" to "Only Supervisor" through the pop-up (Jobs, Only some
  jobs, Supervisor, Back, Save); the Jobs step listed only jobs he is
  qualified for. A build of Nov 1 to 14 with temporary requirements gave him
  only Supervisor shifts, 5 a week and 2 days off; Undo emptied the period
  and the temporary rows were removed.
- The report's reason "Prefers this shift" is now "Their preference", since
  a job preference can be the reason.

- An independent review found three small defects, now fixed: Apply reused
  a plan even when a recurring schedule changed after Generate (it now reads
  them again and plans again if they differ); saving one kind could rewrite
  the other untouched one, dropping a shift or job since gone (the pop-up now
  saves only the kinds changed); and opening the pop-up before job
  preferences loaded could clear one (the button waits for both). A pop-up
  test covers the second.
- Polish for the owner ("the whole UI should also be well polished"): Back
  is an icon button in the header, mirroring Close, with the step's title
  and the person's name under it; shift and job rows read on one line with
  times to the right; choice rows wrap on a narrow screen (buttons default
  to no wrap); chevrons are muted; the Preferences column's text lines up
  with its header. Checked at desktop (light) and 390 wide (dark). 3,788 web
  tests pass.

## Notes for the AI

- Production needs migration 091 before the release merges; the owner
  applies it. Nothing on `main` reads the new table.
- Never reseed or reset the shared local stack; remove temporary data on
  Calm Haven after the check.
