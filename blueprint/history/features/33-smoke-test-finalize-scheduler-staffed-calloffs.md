# Feature: Smoke-test the `finalize_scheduler_staffed_calloffs` publish trigger

**From build-plan:** feature 33
**Status:** verified

## Goal

The trigger shipped with feature 22
(`supabase/migrations/019_finalize_scheduler_staffed_calloffs.sql`) and
had never executed against real data. It runs AFTER INSERT on
`schedule_publish_changes`, inside `publish_schedule`'s transaction, and is
meant to approve an open calloff-backed pickup for the employee whose
published change adds exactly the segments that pickup asks for. The plan
wanted an actual publish-with-staffed-calloff-pickup smoke test.

## What was done

The smoke test is now a permanent live-database integration test,
`apps/web/src/__tests__/finalize-scheduler-staffed-calloffs.integration.test.ts`,
in the same `pg` + `describe.runIf(reachable)` + BEGIN/ROLLBACK harness the
role-escalation and invitation-integrity tests use. It drives the trigger
through the same table writes `publish_schedule` makes, against the seeded
local database, with every id looked up from the seed rather than
hard-coded (a focus area with two active employees, a real shift/job pair
for it, one of the org's absence types, the QA super admin as publisher).

Four cases, all green on the first run against real data:

| case                                             | result                                                                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| published change adds the pickup's exact segment | pickup `approved`, `target_emp_id` = the staffed employee, `target_shift_date`, `absence_type_id` carried from the calloff, `admin_user_id` = publisher, note "Assigned through the published schedule", `resolved_at` set |
| same segment before and after (nothing added)    | pickup stays `open`                                                                                                                                                                                                        |
| published job differs from the pickup's          | pickup stays `open`, no target                                                                                                                                                                                             |
| published deletion (`to_state` null)             | pickup stays `open`                                                                                                                                                                                                        |

The contrast case genuinely ran (Calm Haven seeds 5 jobs), and the
rollbacks left no residue (0 rows on the test date afterwards).

Incidental confirmation from item 27's work: the trigger also rejects
malformed `to_state` payloads through `resolve_schedule_state_storage`
("Worked schedule state must include at least one segment"), which is the
validation path the plan described as structurally sound on inspection.

## Files / areas

- `apps/web/src/__tests__/finalize-scheduler-staffed-calloffs.integration.test.ts` - new

## Notes

Not covered here, deliberately: driving `publish_schedule` end to end from
the UI. The trigger's contract is the inserted change row, which is what
the RPC produces; exercising the RPC itself belongs with the schedule
publish flow's own tests. `npm run test:web` runs this file whenever local
Supabase is up and skips it cleanly otherwise.
