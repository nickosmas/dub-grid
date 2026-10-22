# Feature: Shift requests and staffing keep an absence for the rest of the day

**From build-plan:** feature 45e
**Status:** verified

## Goal

A worked cell with an absence for the rest of the day (D/Sick, D/E/Sick)
works in shift requests, and nothing they write discards its absence.
Staff can drop, swap or call off a shift on a mixed cell, and an approval
keeps the absence on the cell the shift leaves. Someone absent for the rest
of a day takes no more work that day: they are not offered open shifts and
cannot claim, volunteer for or swap into a shift that day (owner,
2026-10-21).

## Design reference

No new screens. The rules come from the owner's item 45 decisions: the
absence belongs to the cell's owner, always comes last, and carries no hours.

## In scope

- Request creation (`create_shift_request_unguarded`, body from 002):
  stop refusing a worked cell that carries a rest-of-day absence, for the
  requester and for a swap target.
- Every write in `resolve_shift_request_unchecked` (body from 030):
  call-off, volunteer, pickup and swap keep the absence on the cells they
  rewrite.
- Availability (owner, 2026-10-21): claim, volunteer and swap refuse a
  person absent for the rest of that day, at the request and again at
  approval; web open-shift staffing leaves them out of its candidates, and
  the mobile open-shift feed marks the shift unavailable to them.

## Out of scope

- **Claiming an open pickup** still fails for everyone: `claim_shift_request`
  writes a target without a date, which `calloff_requires_absence_type`
  refuses (known defect, memory "Call-off pickup claim defect"). 45e adds
  its refusal but does not fix the claim.
- Turning a called-off last shift into a rest-of-day absence (D/E with E
  called off stays D, as today).
- Change descriptions of request outcomes (item 46).

## Data / contracts (load-bearing)

- **Request snapshots stay segment-only:** a request carries the segment
  being handed over, never the absence, which stays with the cell's owner.
- **Writes keep the cell's absence:** wherever the resolver writes a
  worked state for a cell that already had a rest-of-day absence, it
  passes that cell's `absence_type_id` (from
  `get_schedule_cell_snapshot_payload`).
- **Last segment leaves a mixed cell:** a swap away keeps the absence as a
  whole-day absence of that type. A call-off or a pickup to a named
  teammate already writes the request's own absence for the whole day,
  unchanged.
- **Migration 085** restates `create_shift_request_unguarded`,
  `claim_shift_request_unguarded`, `volunteer_for_open_shift_unguarded`
  and `resolve_shift_request_unchecked` from their latest bodies and
  changes only these lines. Another session's uncommitted 46e also numbers
  a migration 085 (applied to the shared local database), so whichever
  lands second renumbers its file, checksum and SQL test.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

## Build steps

- [x] **Step 1 - Requests on a mixed cell (migration 085, part 1).** Restate
      `create_shift_request_unguarded` with the two absence refusals
      limited to whole-day absences, and a swap refused when either side is
      absent for the rest of the day it would take a shift on.
      _Done when:_ live tests create a call-off, a named pickup and a swap
      from a D/Sick or D/E/Sick cell, and a whole-day absence is still
      refused.
- [x] **Step 2 - Approvals keep the absence (migration 085, part 2).**
      Restate `resolve_shift_request_unchecked`, passing the cell's absence
      at each write that leaves shifts behind, and writing it as a
      whole-day absence when a swap takes the last one.
      _Done when:_ live tests approve a call-off of one half of D/E/Sick
      (E/Sick remains), a named pickup of one half of D/E/Sick (E/Sick
      remains) and of the only shift of D/Sick (the request's absence for the
      day), and a swap from D/Sick on another day (Sick remains on each
      side); the SQL text test shows 085 differs from 002 and 030 only in
      those lines; `npm run db:migrations:check` passes.
- [x] **Step 3 - Nobody absent for the rest of the day is offered more.**
      `staffingStateFor` reads the rest-of-day absence and
      `buildOpenShiftStaffingCandidates` leaves that person out; the mobile
      open-shift feed blocks volunteering with "You are absent for the rest
      of this day."; claim, volunteer and swap refuse it in the database.
      _Done when:_ `open-shift-staffing.test.ts` and `data.test.ts` cover
      both, and the live tests refuse a claim, a named pickup and a swap
      (at the request and at approval).

## Files / areas

- `supabase/migrations/085_requests_keep_rest_of_day_absence.sql`,
  `checksums.sha256`
- `apps/web/src/app/(app)/schedule/_lib/open-shift-staffing.ts`,
  `SchedulePageClient.tsx`
- `apps/web/src/features/mobile/server/data.ts`
- Tests: `shift-requests-rest-of-day-absence.integration.test.ts`,
  `requests-keep-rest-of-day-absence-sql.test.ts`,
  `open-shift-staffing.test.ts`, `data.test.ts`.
- Docs: `docs/features/shift-requests.mdx` and its manifest claim.

## Testing

- Live integration tests on the local database, with the integration-test
  lock and unique fixture dates.
- A text test pinning 085 to 030 and 002 except the changed lines.
- Gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- Copy each function's latest body and change only the absence handling;
  review the migration as a diff against that body.
- Rehearse 081 to 085 with `npm run db:migrations:rehearse` before the
  release that carries them.
- Applied locally in one transaction with `psql`, without a ledger row,
  because 46e's 085 already holds that version in the shared ledger.
- Say "absence", never "off day", in new text.

## Completion notes

- **Owner decision (2026-10-21):** someone absent for the rest of a day is
  not offered, and cannot claim, volunteer for or swap into, another shift
  that day. A named pickup already needed its target to have a whole-day
  absence, so a target absent only for the rest of the day is refused there
  too.
- **Migration 085** restates four functions, and the SQL text test pins each
  to its source body (002 or 030) except the changed lines. It was applied
  to the shared local database with `psql` and no ledger row, since 46e's
  uncommitted 085 holds that version there. Renumber whichever lands second.
- **Live tests** (`shift-requests-rest-of-day-absence.integration.test.ts`,
  9 cases) pass alone and with the other request files (61 of 61). Run in
  parallel with other sessions' live suites, they once timed out on locks
  and passed on the rerun.
- **Not covered by a live test:** the approval-time refusal for a claimed
  pickup and for a volunteer. Claims fail for everyone today (the known
  `calloff_requires_absence_type` defect), and a volunteer needs a
  configured coverage gap; the SQL text test pins both refusals.
