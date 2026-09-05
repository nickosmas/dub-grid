# Cell locking removal and editor indicator

**Title:** Remove cell locking, keep author attribution, add a non-blocking editor indicator

**Type:** Fix

**Status:** verified

## The problem

Cell locking was unreliable across several designs. The last one moved locks to
database TTL leases, and the database half was provably correct: atomic acquire
under twelve-way concurrency, RLS enforced, and the trigger emitting all
nineteen expected broadcasts for ten acquires. Live delivery was not. A second
browser applied about three hops and then froze on a stale cell while the
database moved on. Reloading it showed the correct state immediately, so the
fault was confined to live push delivery of the trigger-driven broadcast.

Locking was only ever advisory. Concurrent writes are caught by the optimistic
version check (`OptimisticLockError`, `expectedVersion`,
`handleShiftWriteConflict`), which this change does not touch. Removing locks
therefore costs no data safety, and it removes a class of bug that had already
produced a takeover dialog blocking the user out of their own cell.

## The fix

Delete cell locking entirely and replace it with two things that do not need to
be correct to be useful.

| Concern                     | Owner             | Mechanism                                    |
| --------------------------- | ----------------- | -------------------------------------------- |
| Who is here                 | Realtime presence | `track()` once per connection, identity only |
| Who edited this cell        | Persisted data    | `updatedBy` / `createdBy`, already shipped   |
| Who is looking at this cell | Client broadcast  | `editing_cell`, informational only           |
| Did my save win             | Database          | Existing version check, unchanged            |

Author names on edited cells already worked: `resolveGridAuditLabel` reads the
persisted shift row and renders "Me" or "N. Kosmas". It arrives with the
schedule fetch and cannot suffer a realtime fault.

The position indicator publishes on the leading edge, so the first move after a
pause is sent with no delay, and is capped at one message per 300ms with a
trailing send. A 5 second re-announcement covers the one case a change message
cannot: an editor stops on a cell and the message that would have said so was
dropped. Positions nobody refreshes within 25 seconds fade, so a crashed tab
does not leave a marker.

## Build steps

- [x] **1. Remove cell locking.** Deleted `useCellLocks`, the lease client
      module, `cell-lock-preflight`, migration `014` and its canonical mirrors, the
      cell-busy and session-conflict dialogs, and `guardUnlockedCells`. Guard call
      sites collapsed onto the existing `guardActiveSession`, which carries the
      session-ended check. `cellLocks` became `cellEditors` in the grid and its
      model, and every path that disabled a cell on it was removed, so no cell can
      be blocked. Kept the same-account session banner and its end-sessions action,
      the session-ended dialog, publish and discard, presence avatars and the roster
      card, and the write-conflict path.

- [x] **2. Non-blocking editor indicator.** `useSchedulePresence` publishes
      identity once, and announces position on a separate `editing_cell` broadcast
      with the pacing above. Peers hold positions in a map that expires, feeding the
      existing avatar dot and a corner marker on the cell. Nothing consults it before
      allowing an edit.

- [x] **3. Verification.** Four-round navigation check passed 4/4 in both
      directions, which is the check that was previously unreliable. Presence with a
      concurrent editor confirmed: A sees B online while B has a cell open.

  Publish, discard and the author-name labels could not be driven from the
  scripted harness, because a draft edit commits through
  `handleConfirmEditPanel` and the harness only reached the panel's Close
  control, which dismisses without saving. That is correct product behaviour,
  not a defect, but it left zero drafts so those surfaces never appeared.
  Verified by reading instead: `handlePublish` and `handleCancelChanges` gate on
  `guardActiveSession()` alone, and no lock guard exists anywhere in the tree,
  so neither can be blocked by another editor. `resolveGridAuditLabel` is
  unchanged and still covered by `grid-audit-label.test.ts`. The user confirmed
  all three by hand.

## Verify

- `npm run test:web`, `npm run type-check`, `npm run build`, `npx eslint`
- Two browsers as `qa-super-admin@dubgrid.test` and `qa-editor@dubgrid.test` in
  `pacific-wellness`. Note that Escape does not close the cell editor; use its
  Cancel or Close control.

Measured on the built change:

| Check                               | Result |
| ----------------------------------- | ------ |
| Indicator tracked peer over 30 hops | 30/30  |
| Median latency to peer              | 467ms  |
| Takeover dialog appearances         | 0      |
| Both editors open the same cell     | Pass   |

## Out of scope

- The presence identity work committed at `093b035f`, which is verified and
  deliberately untouched.
- Publish attribution and the publish dialog.
- The write-conflict handling on `schedule_cells`, which remains the real
  protection against concurrent edits.
