# Feature: Decide whether swap-request final approval should notify the swap partner

**From build-plan:** feature 34
**Status:** verified

## Decision

Yes. `shift_request_resolved` only ever messaged the original requester.
The other party is affected as directly: a swap partner's schedule
changes on approval and their agreed swap falls through on rejection, and
an approved pickup's claimant now holds the shift. They already hear about
the intermediate "awaiting approval" step, and the calloff publish trigger
notifies its target too, so silence at the final step was an inconsistency
rather than a deliberate boundary.

## The fix

In `events.ts`'s `shift_request_resolved` case, after the requester's
notification: when `requestInfo.targetUserId` exists and differs from both
the requester and the actor, send the target a notification of the same
approved/rejected type, worded for them ("The swap with {requester} was
approved/declined." for swaps; "Your claim on {requester}'s pickup request
was approved/declined." otherwise), carrying the admin note when present.

This sits beside the claimant branch committed just before it (the case
where rejecting a claimed pickup has already cleared `target_emp_id`); the
two are complementary, keyed on whether the target is still on the row.

## Tests

`events.test.ts` (26/26): swap approved and rejected each notify both
parties with the target-worded copy and note; the target is skipped when
they are the actor. Both new cases fail without the change.

## Files / areas

- `apps/web/src/features/notifications/server/events.ts`
- `apps/web/src/features/notifications/server/events.test.ts`
