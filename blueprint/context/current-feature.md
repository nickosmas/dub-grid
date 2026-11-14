# Feature: Waiting requests on every day involved

**From build-plan:** feature 57a (item 57, Request marks on the schedule)
**Status:** in progress

## Goal

While a shift request waits, the web schedule marks every day it touches, not
only the asker's, and says who acts next: a slate fold while a teammate must
answer, an amber fold while a manager must. A claimer's or volunteer's empty
day shows the shift they would get as a dashed outline. The hover card and the
shift panel say exactly what would happen, who asked and when. Schedulers can
then see pending trades on the grid instead of opening the Requests board.

## Design reference

- The "Request marks on the schedule" canvas,
  https://claude.ai/artifact/Q6VAoiVbqDmvPrF7RBUsnS (owner approved
  2026-11-14). Build against these artboards:
  - **Every request type, stage by stage** - the waiting stages of each type
    (Offered, Claimed; Asked, Accepted; Called off; the call-off's Claimed).
  - **Week grid** - the Waiting view.
  - **Hover cards** - Waiting · swap, Waiting · pickup claim.
  - **Panel: swap awaiting approval**.
- The canvas's Approved and Declined stages belong to 57b and 57c, except that
  a declined, cancelled or expired request simply shows no mark (true today,
  must stay true).

## In scope

Who is marked, by request, in the Week and 2 Weeks grid (the only views that
draw the fold today; the Month view stays as it is):

| Request                                                                                                          | Waiting on                                   | Days marked                                              |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Offer for pickup, unclaimed (`pickup`, `open`, no target, no parent)                                             | teammate                                     | the asker's shift                                        |
| Offer for pickup, claimed (`pickup`, `pending_approval`, target set, no absence)                                 | manager                                      | the asker's shift; the claimer's day                     |
| Request specific person (`pickup` with `absenceTypeId`, target set)                                              | teammate while `open`, manager once accepted | the asker's shift; the teammate's day (their absence)    |
| Volunteer for an open shift (`pickup`, `pending_approval`, no target, no parent; the requester is the volunteer) | manager                                      | the volunteer's day                                      |
| Swap (`swap`, `open` then `pending_approval`)                                                                    | teammate, then manager                       | the asker's day; the partner's `targetShiftDate`         |
| Call off (`calloff`, `pending_approval`)                                                                         | manager                                      | the asker's shift                                        |
| A call-off's open shift, claimed (`pickup`, `pending_approval`, parent set, target set)                          | manager                                      | the open shift in the Open shifts row; the claimer's day |

- **Fold colors:** slate (`#64748B`, as a token) for a teammate, amber (the
  existing warning color) for a manager. Red is no longer used for a request
  fold: red means destructive.
- **Dashed outline:** on a claimer's or volunteer's _empty_ day, the shift
  they would get, drawn as an outline in muted text with the fold. If that day
  already holds a pill, the fold goes on that pill instead and the hover names
  the shift they would add; no outline is drawn over or beside it.
- **Open shifts row:** a call-off's open shift stays in the row while a claim
  on it waits for approval, carrying the amber fold (today it disappears the
  moment someone claims it). Its existing interactions do not change.
- **Hover card:** one request block per mark under the shift details: the
  fold, a status line ("Swap with Carol Henderson · awaiting approval"), what
  would happen in full ("Diane would work Carol's Evening Shift, Tue 3:30 PM -
  Wed 12:00 AM (8.5 hrs). Carol would work this Day Shift."), and "Asked
  Nov 13, 9:12 AM." Wording per type is fixed in Step 2.
- **Shift panel:** a request card at the top for each mark on the cell: the
  title and a status pill, the would-get blocks, the asked line, and, for a
  manager who can approve and a request awaiting approval, Approve and Decline
  with the same note and draft warning as the Requests board.
- More than one waiting request on one day: one fold, amber if any of them
  waits for a manager; the hover card and panel list each request.
- While the requests list is loading or failed to load, no marks are drawn
  (as today); a mark never outlives its request's live status.

## Out of scope

- Approved requests on the grid, outcome chips, and recording approvals as
  changes: 57b and 57c.
- The mobile app (item 57 is web only, owner 2026-11-14).
- New request actions in the panel beyond Approve and Decline for approvers:
  a teammate's Accept and Decline, and the asker's Cancel request, stay on the
  Requests board. The asker's own "A request is already active for this shift"
  banner is replaced by the request card, without a Cancel button.
- Accept and claim times: requests do not store when a teammate accepted or a
  claim was made (`updatedAt` changes for other reasons too), so the hover and
  panel name only when the request was asked. Storing those times is a later
  decision.
- Coverage-gap open shifts: their count rule (a pending volunteer reduces what
  is still needed) stays as it is; the volunteer's day carries the mark.
- Who can see a request: unchanged. Marks are drawn only from the requests the
  viewer's request list already holds; nothing new is fetched or exposed.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Request mark model** - a pure function that turns the
      viewer's requests into marks per cell and per open shift, following the
      table in In scope, with the `RequestCellMark` contract below. _Done
      when:_ unit tests cover every row of the table, a cell in two requests
      (amber wins, both listed), declined, cancelled, expired and approved
      requests (no mark), a swap across two dates, a named pickup's target
      day, and an empty or failed request list (no marks).
- [x] **Step 2 - Request wording** - a pure formatter for the hover and panel
      text of each mark: status line, what would happen (both sides, full
      shift names, 12-hour times with hours, midnight-crossing days named), and
      "Asked <date, time>" in the organization's time zone. _Done when:_ unit
      tests pin the exact strings for each request type and both waiting
      states, including a shift crossing midnight and offering one shift of a
      day with two (only the offered shift is named).
- [x] **Step 3 - Folds from the model** - the grid draws the fold from the
      marks instead of the requester-only `activeRequestForKey`, in slate or
      amber, on every pill kind that shows a fold today (single shift, double
      shift, whole-day absence). _Done when:_ in the browser, each waiting
      stage on the canvas shows the same folds on the same days, and no
      request fold is red.
- [x] **Step 4 - Dashed outline on an empty day** - the claimer's or
      volunteer's empty day shows the shift they would get as a dashed
      outline with the fold; a day that already holds a pill shows only the
      fold. _Done when:_ both cases render as on the canvas in the browser,
      the outline is not clickable as a shift, and nothing on the pill is
      covered.
- [x] **Step 5 - Claimed call-off open shift stays visible** - the Open
      shifts row keeps a call-off's open shift while a claim on it waits, with
      the amber fold. _Done when:_ claiming one in the browser leaves it in
      the row with the fold, approving or declining the claim updates the row
      as today, and the open-shift tests cover the claimed case.
- [x] **Step 6 - Hover card request block** - the hover card lists each mark's
      request block from Step 2. _Done when:_ hovering each marked day in the
      browser matches the canvas's hover cards, with only the asked time.
- [x] **Step 7 - Panel request card** - the shift panel shows a request card
      for each mark on the cell (read-only for everyone), replacing the asker's
      "A request is already active" banner. _Done when:_ opening each marked
      day in the browser matches the canvas panel, without action buttons.
- [x] **Step 8 - Approve and Decline in the panel** - for someone who can
      approve and a request awaiting approval, the card offers Decline
      (secondary) and Approve (primary) side by side, with the board's note
      field, `loadApprovalDraftWarning` warning and confirmation. _Done when:_
      approving and declining from the panel in the browser behaves exactly as
      from the Requests board (same dialogs, same result, marks update), and
      a viewer who can't approve sees no buttons.
- [ ] **Step 9 - Docs** - `docs/features/shift-requests.mdx` and
      `docs/features/schedule-grid.mdx` describe the marks, colors, outline,
      hover and panel; fingerprints re-recorded. _Done when:_ `docs:check`
      passes and the pages match the browser.

## Files / areas

- `apps/web/src/app/(app)/schedule/_lib/request-marks.ts` (new) and its test:
  the mark model.
- `apps/web/src/app/(app)/schedule/_lib/request-mark-text.ts` (new) and its
  test: the wording.
- `apps/web/src/app/(app)/schedule/_lib/open-shifts.ts`: claimed call-off open
  shifts.
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`: build the marks,
  pass them to the grid and panel, replace `activeRequestForKey`.
- `apps/web/src/components/ScheduleGrid.tsx`,
  `apps/web/src/components/schedule-grid/badges.tsx`: folds, outline, hover
  block.
- `apps/web/src/components/ShiftEditPanel.tsx`: request card, Approve and
  Decline.
- `apps/web/src/components/shift-requests/approval-draft-warning.tsx`: reused.
- `apps/web/src/types/index.ts`: `RequestCellMark`.
- `docs/features/shift-requests.mdx`, `docs/features/schedule-grid.mdx`,
  `internal/documentation/accuracy-manifest.json`.

## Data / contracts

**Load-bearing:** 57c reads these marks beside its approved-request chips.

```ts
type RequestMarkWaitingOn = "teammate" | "manager";

type RequestMarkRole =
  | "asker" // the requester's own shift
  | "partner" // a swap's other side, or the teammate a named pickup asks
  | "claimer" // took an offered pickup or a call-off's open shift
  | "volunteer" // volunteered for a coverage-gap open shift
  | "open-shift"; // a call-off's open shift in the Open shifts row, once claimed

interface RequestCellMark {
  requestId: string;
  type: ShiftRequestType; // "pickup" | "swap" | "calloff"
  role: RequestMarkRole;
  waitingOn: RequestMarkWaitingOn;
  /** The shift this person would get, for the dashed outline; null when they would get nothing new. */
  wouldGet: ScheduleCellState | null;
}

interface RequestMarks {
  /** Keyed `${empId}_${dateKey}`, the grid's cell key. */
  byCell: Map<string, RequestCellMark[]>;
  /** Keyed by the call-off open shift's request id (`GridOpenShift.requestId`). */
  byOpenShift: Map<string, RequestCellMark>;
}
```

- `ActiveShiftRequestSummary` and `activeRequestForKey` are replaced by these.
- No schema change and no new request fields in 57a.

## Testing

- Unit (Vitest, required by the testing gate): the mark model (Step 1), the
  wording (Step 2), and the claimed open-shift case in `open-shifts.test.ts`
  (Step 5).
- Browser on local Calm Haven, as a Super Admin and as staff, for each waiting
  stage of each type on the canvas: folds and colors, outline, Open shifts
  row, hover, panel, and Approve and Decline from the panel. Screenshots for
  the review.
- `npm run type-check`, `npm run lint`, the web suite, `docs:check`.

## Notes for the AI

- Read the canvas artboards before Step 3; build to them, not to this prose.
- Every string is exact: full shift and job names, 12-hour times with hours,
  a shift crossing midnight names both days, no times the data doesn't hold
  (feedback: insights never misleading; shift change display rules).
- Nothing on a pill may cover anything else; the fold keeps today's 16 px
  triangle and position (grid pills never obscure).
- Peer buttons are equal width in a two-column grid; one filled button
  (Approve); Decline is a neutral secondary, never red (coding standards,
  buttons).
- Approving from the panel must go through the same warning and confirmation
  as the board: an approval publishes at once and replaces drafts of the cells
  it writes.
- Build in a worktree on `feature/57a-request-marks` cut from `origin/dev`
  (AGENTS.md); the shared packages resolve to the main checkout's builds.
