# Feature: Suspended until

**From build-plan:** feature 51g3 (item 51g, Dated status changes)
**Status:** verified

## Goal

A manager can give a suspension an end: Suspend, Ends Fri, Nov 20. They can't
sign in until then, and on Nov 20 in the organization's timezone the daily job
reinstates them the way a manual Reinstate does. A suspension can also start
later: Suspend, Starts Mon, Nov 10, Ends Fri, Nov 20. Until Nov 10 they keep
their access and nothing changes; on Nov 10 the job suspends them the way a
manual Suspend does (signed out everywhere, push off, the notice email, the
Super Admin alert, their open requests closed).

The end of a current suspension lives on the employee beside `suspended_at`
(`suspended_until`), as an Away person's return date sits beside their status.
A suspension planned for later is 51g1's planned change with
`planned_status = 'suspended'`, its end in `planned_until`.

## Design reference

No new board. Built from 51g1's Change status dialog (Starts and Return date),
the status card's dashed planned card and Edit plan, and 51e's Away-until
copy ("Away until Jan 4" becomes "Suspended until Nov 20").

## Decisions made (owner delegated, 2026-10-28)

- **Storage of a current suspension's end:** a new `employees.suspended_until`
  (DATE, the first day with access back), not the plan. Reason: a suspended
  person can't hold a plan (103's `employees_planned_only_when_active`), and
  it mirrors `away_until` beside an Away status. 101's guard clears it with
  the suspension.
- **Storage of a planned suspension:** `planned_status = 'suspended'`,
  `planned_from` its first day, `planned_until` its end (optional), no
  absence. Reason: one plan per person (51g1), reused by 51g2.
- **A planned suspension locks no days:** a suspended person stays on the
  schedule and schedulable (51c), so `employee_schedulable_on` and the
  planned-days rewrite ignore it. Replacing a planned away with it puts that
  away's absence days back, as cancelling does.
- **Dates:** Starts is today (default) up to a year ahead, as 51g1. Ends is
  optional, after today or after a later start, with no upper limit, as an
  Away return date. The field is named **Ends** (pairs with Starts; empty
  means until someone reinstates them).
- **Who can:** suspending now or later needs an account (`NO_ACCOUNT`), an
  Active person who isn't suspended, and the same permission, self, tier,
  only-Super-Admin and Gridmaster fresh-proof guards as Suspend. A planned one
  is refused for the only Super Admin at planning, and the job skips them
  (keeping the plan) if they become the only one, as 51g2 does.
- **One plan per person:** a planned suspension replaces a planned away or
  last day, and marking them away, a last day or offboarding cancels it; each
  confirmation says so. While one is planned, Suspended stays in the list
  disabled, "Planned from Tue, Nov 10. Change it with Edit plan." (the
  status-choices fix's rule, landed alongside); Edit plan moves its dates or
  cancels it, and clearing Starts suspends them now, as 51g1 and 51g2 do.
- **Editing a current suspension's end:** for a suspended person the dialog
  shows Ends under the status card with **Save changes**, as an Away person's
  return date (51d); the card's menu offers **Set end date** or **Change end
  date**. A new `setSuspendedUntil` action, audited as
  `employee.suspension_end_changed`.
- **The job:** the return-from-away job, behind its flag, first reinstates
  everyone whose end date has come (one version-guarded update each, the same
  columns a manual Reinstate clears, an `employee.reinstated` row with no
  actor), then starts each due planned suspension through the same update
  and follow-up as a manual Suspend: `suspended_at`, `suspended_by` and
  `updated_by` the planner, `suspended_until` from the plan, sessions ended,
  push off for the organization, the notice email and Super Admin alert
  (credited to the planner). A plan whose end has already come, or whose
  person no longer has an account, is dropped.
- **Sign-in:** the hook's suspended message gains the end date
  ("... Until 2026-11-20."), so web, mobile and the invitation sign-in show
  "Your organization has suspended your access to the app until Fri, Nov 20."
  The sentinel match is unchanged (`includes`).
- **Email:** the notice says "You can't sign in to Calm Haven until Fri,
  Nov 20." when it has an end. The Super Admin alert is unchanged.
- **Audit rows:** `employee.suspension_planned`,
  `employee.suspension_plan_changed`, `employee.suspension_plan_cancelled`,
  `employee.suspension_end_changed`; Suspend carries `suspendedUntil`.
- **Copy:**
  - status card and box: "Suspended until Fri, Nov 20" (else "Suspended
    since Oct 26");
  - pill and record: "Suspended until Nov 20";
  - planned card: "Suspended from Mon, Nov 10", detail "Until Fri, Nov 20."
    or "No end date."; muted pill text "Suspended from Nov 10";
  - Suspend with an end: message "They get access back on Fri, Nov 20.";
  - Suspend later: button **Schedule suspension**, message "They keep their
    access until Mon, Nov 10.", points "On Nov 10 they're signed out on every
    device and can't sign in.", the requests point with "then", and "They get
    access back on Nov 20." with an end;
  - editing: **Save changes** / **Cancel planned suspension**.
- **Mobile date pickers (51g2's gap):** Starts and Last day cap at a year
  ahead on mobile too.

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`: `PlannedStatus`
      adds `suspended`; `suspendedUntil` on `Employee` and the status states;
      Suspended-until labels, box, card, planned card, pill and mark text;
      `describeStatusAction("suspend")` with a start and an end,
      `setSuspendedUntil`, planned-suspension `setPlannedChange` and
      `cancelPlannedChange`, the cancelled-plan point; `statusChoices` leaves
      out Suspended while one is planned; `SUSPENDED_UNTIL_INVALID_*`;
      `suspendedUntilFromMessage` and `accessSuspendedBody`. _Done when:_
      domain tests cover each.
- [x] **Step 2 - Migration 105.** `suspended_until`, its check and 103's guard
      extended; `planned_status` takes `suspended` with no absence; the hook's
      suspended message carries the end. _Done when:_ `db:migrations:check`
      passes and a live test shows the end cleared with a reinstatement, a
      planned suspension locks no day and replaces a planned away's absence
      days, starting it closes requests and clears the plan, and the hook's
      message names the end.
- [x] **Step 3 - Server.** Types, mappers, column lists and mobile contracts
      carry `suspendedUntil`; the web route and `mobile-api-core` accept a
      start and an end on `suspend`, `setSuspendedUntil`, and a planned
      suspension on `setPlannedChange` and `cancelPlannedChange`; audit rows;
      the notice email with the end; the login routes pass the end. _Done
      when:_ route tests on both paths.
- [x] **Step 4 - The daily job** reinstates due ends and starts due planned
      suspensions. _Done when:_ cron route tests: due today, not yet due, only
      Super Admin skipped, dropped plans, follow-up called.
- [x] **Step 5 - Web.** Change status: Suspend gets Starts and Ends; a
      suspended person's Ends with Save changes and the card menu item; Edit
      plan for a planned suspension; the status card, People list, record and
      Gridmaster card; the Access suspended modal names the end. _Done when:_
      component tests and screenshots.
- [x] **Step 6 - Mobile.** The Change status sheet's Suspend gets Starts and
      Ends, the suspended person's Ends, plan editing; the People row and pill;
      the sign-in message; the year cap on Starts and Last day. _Done when:_
      screen tests.
- [x] **Step 7 - Docs.** Roster guide: a suspension's start and end. _Done
      when:_ `npm run docs:check` passes.

## Out of scope

- First day (51g4); bulk (51h); push and email gating (51j).
- A reminder before a planned suspension starts.

## Testing

- Live integration test for 105 (BEGIN/ROLLBACK); 101 to 104's still pass.
- Domain, route, cron, component and screen tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- The hook is 101's copy; change only the suspended branch.
- `rewrite_planned_away` treats only `away` and `removed` as days to clear, so
  a planned suspension needs no change there.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint` (the two old
  `<img>` warnings, none new), `npm run test:mobile` (mobile 1,549 and every
  package), `npm run test:web` (6,666 of 6,691 on the first run; the 25
  failures were the 101 to 105 integration suites reading a Calm Haven QA
  person this session had suspended for screenshots; with the fixture put
  back they pass, 30 of 30), `npm run docs:check`, `npm run db:migrations:check`.
- Migration 105 integration test (6) on the local stack beside 101 to 104's;
  105 applied to the local database only.
- Rebased onto the status-choices fix (`fix/status-choices-list`): a planned
  suspension lists Suspended disabled with its Edit plan reason, on web and
  mobile, with tests.
- Browser, Calm Haven as the QA Super Admin (worktree dev server): the status
  card "Suspended until Fri, Nov 20" with Reinstate and the menu, the end-date
  dialog, the planned card "Suspended from Tue, Nov 10 / Until Fri, Nov 20.",
  Edit plan with Starts and Ends, and Suspend with a start and an end. The
  fixture rows were put back afterwards.
- Not taken: a mobile simulator screenshot (screen tests cover the sheet);
  a live run of the daily job against the local stack (route tests cover
  starting, ending, dropping and the only-Super-Admin skip).
