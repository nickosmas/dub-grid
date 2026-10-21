# Fix: Claiming an open pickup works, and a call-off leaves its shift open

**Type:** Fix
**Status:** verified
**Branch:** `fix/open-pickup-claims` (cut from `dev` at da192350)

### The problem

Two database defects, found 2026-09-21 and never fixed, make "claim this
shift" dead everywhere:

1. **Every claim fails.** `claim_shift_request_unguarded` (latest body in
   `085_requests_keep_rest_of_day_absence.sql`) sets `target_emp_id` on an
   open pickup. The `calloff_requires_absence_type` check
   (`001_schema.sql:1062`) allows a pickup with a target only when it also
   has a target date and an absence type, which is the shape of a pickup
   offered to a teammate who is off that day. A claim has neither, so the
   check refuses it.
2. **A call-off cancels its own open shift.** Approving a call-off inserts an
   open child pickup "so other staff can claim the vacated shift", then
   cascade-cancels every active request on that person and date, which
   matches the child it just created (`Auto-cancelled: shift was called
off`).

Behind the second sits a third: approving a claim checks that the requester
still holds the shift and then takes it away from them. A call-off's child
pickup belongs to someone who no longer holds the shift, so even a working
claim on it would be refused at approval.

What this breaks: the requests guide says "An approved time-off request
leaves the shift open. When a scheduler fills it in a draft and publishes,
the time off is settled." The web grid's call-off open shifts
(`buildGridCalloffOpenShiftsFromRequests`), the finalize trigger
(`020_publish_repairs.sql`) and claims on the Requests board and in the app
all wait for an open child pickup that never survives.

### The fix

| Rule                                    | Value                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim shape                             | A claim sets `target_emp_id` and `target_shift_date` (the requester's date) and no absence type. So "requests involving this person on this date" checks see the claimer                             |
| Check                                   | `calloff_requires_absence_type` allows a pickup with a target and a date, with or without an absence type. A pickup to a named teammate still needs one, enforced by `create_shift_request` as today |
| Call-off                                | Its cascade-cancel skips the child pickup it just created                                                                                                                                            |
| Approving a claim on a call-off's child | Skips the "requester still holds the shift" check and leaves the requester's cell alone: the call-off already took the shift away                                                                    |
| Unchanged                               | Pickups offered to a named teammate, volunteers for coverage gaps, swaps, the rest-of-day absence rules from 45e, and auto-approval                                                                  |

### Build steps

- [x] **1. Migration 088.** Replace the check (`lock_timeout`, drop, re-add);
      restate `claim_shift_request_unguarded` and
      `resolve_shift_request_unchecked` from 085 with only those changes.
      Checksum line.
      _Done when_ live tests, on the pattern of
      `shift-requests-rest-of-day-absence.integration.test.ts`, show: a
      claim of an open pickup succeeds and approving it moves the shift to
      the claimer; approving a call-off leaves its child pickup open, which
      can be claimed, and approving that claim gives the claimer the shift
      without touching the requester's absence; a pickup to a named
      teammate still needs its absence; a second claim by the same person
      on that date is refused. A SQL text test pins both functions to 085 and the published-days list to 086
      except these lines, and `npm run db:migrations:check` passes.
- [x] **2. The apps.** Check that the web Requests board, the grid's
      call-off open shifts and the app show a claimed pickup and a call-off's
      open shift correctly, and fix any reader that took a target on a
      pickup to mean "offered to a named teammate".
      _Done when_ a browser check as the QA account claims an open pickup
      and a call-off's open shift on the local stack, and each shows as
      awaiting approval, then approved.

### Evidence (2026-10-21)

- **Step 1:** migration 088 applied locally with `psql` (grants unchanged,
  check validated). `open-pickup-claims.integration.test.ts` (8 cases):
  claim and approve an open pickup; a call-off leaves its pickup open, and
  a claim on it staffs the shift while the requester keeps the call-off's
  absence; a partial call-off keeps its other shift; a stale request on the
  called-off day is still cancelled; a rejected claim reopens with no target
  or date; a second claim that day is refused; a named pickup still needs
  its absence; a date with no target is still refused.
  `open-pickup-claims-sql.test.ts` pins both functions to 085 and the published-days list to 086. All 200 tests
  in the 16 request-related files pass.
- **Step 2:** the shared request copy said "Offered to cover X's shift" for
  any pickup with a target, which was written for named pickups. A claim
  now reads "Offered this shift for pickup, and X claimed it", and a
  call-off's pickup "Called off this shift, so it's open for pickup" (or
  "..., and X claimed it"). Callers that leave out `absenceTypeId` keep the
  old wording. Browser, 2026-10-21, `qa-admin` on the local app: Available
  Shifts listed both staged shifts with the new wording, the grid's Open
  Shifts row showed the call-off's shift, both claims were approved on the
  spot ("Shift is yours"), and History showed both. The database matched:
  QA Admin worked both days, QA Management's Nov 2 was cleared and Nov 3
  kept the call-off's absence. No console errors. Test data removed.
- **Docs:** the requests guide says a teammate can claim an approved time
  off's open shift; its fingerprint is re-recorded.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web` and `npm run build`
  pass.
- On the local app: post a shift for pickup as one QA user, claim it as
  another, approve it; approve a call-off and see its shift in Open Shifts.

### Out of scope

- A claimed call-off child that a scheduler also staffs by publishing: the
  finalize trigger settles only open children, so approving the claim
  afterwards would staff the shift twice. Note it if seen; fix separately.
- Changing who can approve (auto-approval rules from 030 stay).

### Notes for the AI

- Migration number: 086 went to approval-replaces-draft (9f066b69) and 087
  to 46e (e3f4da02) on `dev`, so this is 088. Approval-replaces-draft discards the earlier drafts of every
  day an approval publishes, listed by `shift_request_published_cells`; 088
  restates it so a claimed call-off pickup leaves the requester's day out
  (the approval no longer writes it). Apply locally with `psql` in one
  transaction, without a ledger row.
- Never edit an applied migration; 085 is in production.
- Live tests run in BEGIN/ROLLBACK with `actAsAuthenticated`; Calm Haven QA
  users only, never Arden Wood.
