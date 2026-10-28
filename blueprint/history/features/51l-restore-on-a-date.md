# Feature: Restore on a date

**From build-plan:** feature 51l (item 51, Staff statuses)
**Status:** verified

## Goal

A manager can bring an Offboarded person back on a later date: Restore,
Starts Tue, Nov 10. Until then they stay Offboarded in every way (no sign-in,
no seat, not on the schedule), the People list and their record say
"Returns Nov 10", and on Nov 10 in the organization's timezone the daily job
restores them the way a manual Restore does: Active again, their membership
reopened, able to sign in and be scheduled.

This reuses 51g1's planned change (`planned_*` on the employee, one per
person, the dashed Planned card with Edit plan, and the daily job) with a
fourth planned status, held by an Offboarded person instead of an Active one.

## Design reference

No new board. Built from 51g2's Last day: the Restore confirmation gets a
Starts field, the planned card and Edit plan behave as they do for a last day,
and the People list's muted text reads like "Leaving Nov 8".

## Decisions made (owner delegated, 2026-10-28)

- **Storage:** `planned_status = 'active'` on a `removed` row, `planned_from`
  the return day, no `planned_until` and no absence. Reason: the plan names
  the status it leads to, as `away`, `removed` and `suspended` do, and
  `planned_from` stays "the change's first day".
- **Who can have one:** only someone Offboarded, and it is the only plan they
  can have. The constraint that kept plans to Active people allows this one
  kind for `removed` rows; restoring them by any path (the job, Restore now,
  bulk, Gridmaster) ends it. Reason: 51g1's one plan per person.
- **Starts range:** tomorrow up to a year ahead (`isValidPlannedStart`), like
  51g1's Starts. Empty or today restores now, unchanged. Reason: the same
  field and limit as every other planned change.
- **Not schedulable before the day, and not ahead in the draft:** they stay
  off the schedule until the job restores them, and nobody can draft their
  shifts from the return day beforehand. Reason: an Offboarded person is off
  the grid, the planners and staffing entirely, and the schedule RPCs refuse
  an archived record in many places besides `employee_schedulable_on`;
  drafting ahead would put an Offboarded person on the schedule for the
  first time across all of them. A manager who needs them drafted ahead can
  restore them now with a First day (51g4) on the return date, which gives
  sign-in now and locks the earlier days.
- **No First day is set:** the restore keeps their original first day.
  Reason: a first day is a lasting fact about when they started (51g4), and
  on the return day they're schedulable from then anyway.
- **The job:** the return-from-away job, behind its flag, restores each due
  plan through the same update a manual Restore makes (status Active,
  `archived_at` cleared, `updated_by` the planner) and then
  `reopenRestoredAccess` (membership reopened, caches cleared). Its audit row
  has no actor, like the job's other rows, and carries the return date, so
  the activity log reads "Barbara Trent was restored on their return date,
  Nov 10". The tier was checked when the return was planned, so the job
  doesn't re-check it, as with a last day.
- **Tier guard:** planning, moving or cancelling a Super Admin's planned
  return takes a Super Admin or Gridmaster, with Restore's message. Reason:
  51k keeps the Super Admin tier's membership to Super Admins; cancelling a
  return keeps a Super Admin out as surely as offboarding them.
- **Fresh proof:** unchanged. Restore never asked a Gridmaster for it; editing
  any plan (`setPlannedChange`) still does.
- **While a return is planned:** Change status lists Active disabled with
  "Returns Tue, Nov 10. Change it with Edit plan.", so the card has no main
  button and the dashed Planned card's Edit plan changes the date or cancels
  it; clearing the date restores them now, as 51g1 and 51g2 do.
- **Bulk Restore stays now-only:** it skips anyone with a return planned,
  with the same reason as Change status. Reason: the bar and the list agree
  (51h), and the plan is edited on the person.
- **Gridmaster card:** Restore stays now-only there and replaces the plan;
  the card's Planned field reads "Returns Nov 10".
- **No message to the person:** nothing is sent when a return is planned or
  when it happens, as with a manual Restore. Reason: they can't sign in yet,
  and emails never name the actor.
- **Audit:** `employee.restore_planned`, `employee.restore_plan_changed`,
  `employee.restore_plan_cancelled`.
- **Copy:**
  - Restore with a later start: button **Schedule restore**, message "They
    stay Offboarded until Tue, Nov 10.", points "On Nov 10 they're back to
    Active and can sign in again." (no account: "On Nov 10 they're back to
    Active.") and "They can be scheduled from Nov 10, not before.";
  - planned card: "Returns Tue, Nov 10", detail "Back to Active then: they
    can sign in and be scheduled." (no account: "Back to Active then, and can
    be scheduled.");
  - People list, mobile People row, record and Gridmaster card: "Returns
    Nov 10"; the name mark "Offboarded, returns Nov 10";
  - editing: **Save changes** ("Change Barbara Trent's planned return?") and
    **Cancel planned return** ("They stay Offboarded until someone restores
    them.").

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`: `PlannedStatus`
      adds `active`; `plannedReturn`; the card's planned card, the box
      detail, the pill and record text and the name mark for a planned
      return; `describeStatusAction("restore")` with a start date,
      `setPlannedChange` and `cancelPlannedChange` for a return;
      `statusChoices` disables Restore while one is planned (so bulk skips
      them); `describeUpcomingStatus` for list rows. _Done when:_ domain
      tests cover each.
- [x] **Step 2 - Migration 109.** Allow `active` as a planned status, held
      only by a `removed` row with no end or absence; the guard keeps it
      while they stay Offboarded and drops it when they're restored. _Done
      when:_ `db:migrations:check` passes and a live test shows a planned
      return saves on an Offboarded row only, refuses an end, is cleared by a
      restore, leaves their days unschedulable, and 103 to 108's tests still
      pass.
- [x] **Step 3 - Server.** Types and contracts take `active`; the web route
      and `mobile-api-core` accept `startDate` on `activate` for an
      Offboarded person, `setPlannedChange` and `cancelPlannedChange` for a
      return, with the tier guard and the audit rows. _Done when:_ route
      tests on both paths.
- [x] **Step 4 - The daily job** restores due returns. _Done when:_ cron
      route tests: due today, not yet due, membership reopened, the flag off.
- [x] **Step 5 - Web.** Restore gets a Starts field in Change status; Edit
      plan edits or cancels a return; the status card, People list, record
      and Gridmaster card show "Returns Nov 10". _Done when:_ component tests
      and screenshots.
- [x] **Step 6 - Mobile.** The Change status sheet's Restore gets the Starts
      row, plan editing handles a return, the People row shows it. _Done
      when:_ screen tests.
- [x] **Step 7 - Docs.** Roster guide: restore on a date. _Done when:_
      `npm run docs:check` passes.

## Out of scope

- Drafting their shifts from the return day before it comes (see Decisions).
- A planned return in bulk.
- Restoring recurring schedules or shifts their Offboard removed.

## Testing

- Live integration test for 109 (BEGIN/ROLLBACK); 103 to 108's still pass.
- Domain, route, cron, component and screen tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- `clear_away_until_off_away` is restated from 105; keep every other line.
- `rewrite_planned_away` already returns early for a `removed` row and
  ignores a planned status other than `away` and `removed`, so it needs no
  change.

## Completion evidence

- Gate in the worktree: `npm run type-check` passed; `npm run lint` 0 errors
  (the 2 old `<img>` warnings); `npm run test:web` 718 files, 6,834 tests
  passed; `npm run test:mobile` passed every package and mobile (178 files,
  1,568 tests); `npm run docs:check` 34 verified; `npm run
db:migrations:check` passed with 109 locked.
- Migration 109 applied to the local stack only (not production);
  `migration-109-planned-restore.integration.test.ts` (5) passes beside 099
  to 108's.
- Rules and routes: domain tests for the planned return's copy, card, list
  text, mark and the disabled Restore (and bulk skip); web route tests for
  planning, restoring now with today's date, refusing a far or past date,
  moving and cancelling, and the Super Admin tier on all three; the
  mobile-api-core tests for the same; cron tests for a return due today, not
  yet due, already due in Tokyo, changed meanwhile, and the flag off;
  component tests for Restore with Starts, Edit plan's move, cancel and
  clear, the card with no button, and the record's Planned field; mobile
  screen tests for the same.
- Live, from the worktree dev server as Calm Haven's QA Super Admin, on a
  throwaway Offboarded person (deleted afterwards): Restore with Starts Tue,
  Nov 10 through the card saved the plan (`employee.restore_planned`), the
  card showed "Returns Tue, Nov 10" with Edit plan, the People list's
  Offboarded tab showed "Returns Nov 10", and Edit plan opened "Change Rosa
  Returnwell's planned return?". With the return moved to today,
  `GET /api/cron/return-from-away` answered `restored: 1`; the row was
  Active with `archived_at` cleared, the plan gone, `updated_by` the planner,
  and an `employee.activated` row with `returnDate`.
- Not verified live: reopening a membership from the job (the fixture had no
  account; covered by route and cron tests), and a mobile simulator
  screenshot (screen tests only).
