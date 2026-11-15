# Fix: staff see their own request history and their own publish notices (web)

**Status:** complete

## Problem

- The request board's History tab, and its lookup, were there only for people
  who can approve or see every request. A regular user couldn't look back at
  the requests they made or were asked to take, or at what a manager said.
- My requests, when empty, didn't say how to start a request.
- The Recently published bars counted everyone's changes for everyone. A
  regular user learned that "12 shifts changed" without learning whether any
  were theirs.

## Fix

- History for everyone. A regular user's History lists their own decided
  requests (approved, rejected, cancelled, expired) with the outcome and any
  manager note; the card already showed a requester the note, as mobile's
  shift detail does. `POST /api/schedule/requests` (`fetchShiftRequests`)
  already scoped such a caller to requests they made or were the target of,
  in the effective organization, and a passed `empId` only narrows that.
  `request-history.ts` holds the board to it too, so an account the route
  lets see more (a staff manager who can't approve or edit shifts) still
  sees only their own here. Reviewers keep their History and its person
  filter; anyone else gets no person filter.
- My requests, empty, says "Open one of your shifts on the schedule to offer,
  swap or call it off." to someone on the schedule.
- `publish-notice.ts`. Someone who can't edit shifts, edit notes or publish
  sees only their own days: the bar for the period on screen says "Your
  shifts changed on Tue, Nov 3 and Thu, Nov 5" (past three, "and 2 more
  days") with when their shifts last changed, and the other-periods bar says
  "Your shifts changed in 2 other weeks", each period button counting their
  days. Neither shows when none of their shifts changed. Each day is folded
  the way the grid folds it, so a shift changed and changed back isn't a
  change, and a period's first publication isn't one either. Editors and
  publishers keep the organization counts and chips. Only a change's person
  and day are read, which the server sends even when Settings > Display hides
  change details (item 46). There is no staff toast when someone else
  publishes, so nothing else changed.

## Evidence

- `request-history.test.ts` (7): staff get only theirs, nothing without a
  staff record, no person filter for staff, open and waiting left out,
  outcome filter, newest decision first, reviewer sees everyone.
- `publish-notice.test.ts` (14): own days folded, baseline skipped, changed
  and changed back dropped, hidden details still read, day wording, period
  grouping for editors and staff, other-periods wording.
- `ShiftRequestBoard.test.tsx`: the empty My requests hint, a staff History
  with outcome and manager note and nobody else's request, the reviewer's
  person filter kept.
- `requests/route.test.ts`: a staff caller's history fetch keeps their own
  scope ahead of any `empId`, and a sandbox session reads its sandbox.
- Type-check, lint, docs check pass.

## Not in this fix

- Notes changed on a person's day don't count toward their notice; only
  shift changes do.
- The board's subtitle still reads "Pickups, swaps, and approvals" for staff.
- Toolbar and active-request changes from the same stale commit are another
  fix.
