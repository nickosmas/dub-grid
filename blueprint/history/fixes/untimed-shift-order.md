# Fix: A double shift with an untimed general shift keeps the order it was picked in

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

### The problem

The double-shift fix (`blueprint/history/fixes/double-shift-picker.md`,
released in #162) stores a cell's two shifts in start-time order, and sorts
a shift with no start time after a timed one. Regular shifts always have
start and end times. Only a general shift can have none, and then it has no
place on the clock.

So picking Office (a general shift with no times) and then Evening saves
Evening, then Office, and the cell reads in an order the manager never
chose. Nothing about the shifts supports that order.

The rule lives in `orderSegmentsByStartTime`
(`apps/web/src/components/shiftEditTime.ts`), which `ShiftEditPanel` calls
when a second shift is added.

### The fix

Sort by start time only when every shift in the cell has one, whether a
custom time or the shift's default. If any shift has no start time, keep
the order the shifts were picked in and return the inputs untouched.

It must not break:

- time ordering for timed shifts: Evening then Day still saves Day, then
  Evening, with each custom time moving with its shift;
- a general shift that does have times, which still sorts by them;
- the added-shift count from #162, which matches published shifts by shift
  and job (`countShiftsAddedToPublishedCell`).

### Build steps

- [x] **1. Untimed shifts keep the picking order.** In
      `orderSegmentsByStartTime`, return the inputs unchanged when any
      shift lacks a start time, and update its doc comment. Replace the
      test "puts a shift without a start time after a timed one" with cases
      for both orders of an untimed and a timed shift. Add a
      `ShiftEditPanel` case: Office (general, no times) first, then Evening,
      saves Office at position 0.
      _Done when_ those tests pass, fail on the current code, and the
      existing timed-pair cases (including Day added to a cell holding
      Evening) still pass.

### Verify

- `npm run type-check`, `npm run lint` and `npm run test:web` pass.
- In the browser, on the Schedule page:
  - pick Office, then add Evening: the cell reads Office, then Evening;
  - pick Evening, then add Office: the cell reads Evening, then Office;
  - pick Evening, then add Day: the cell reads Day, then Evening.

### Evidence

- `npm run test:web` from the worktree: 641 files, 5,730 tests passed. The
  new `orderSegmentsByStartTime` case and the `ShiftEditPanel` case (Cross
  Wing, untimed, picked before Day stays first) fail on the previous code;
  the timed-pair cases, including Day added to a cell holding Evening, still
  pass.
- `npm run type-check` (24 tasks) and `npm run build` (91 pages) passed from
  the worktree; `eslint` on the changed files passed.
- `npm run docs:check` passed after `docs:fingerprint -- --write
schedule-grid`; the changed evidence was the panel test, and the page's
  claims do not cover double-shift order.
- Not checked in a browser: the local organization with an open trial has
  no regular shift any employee can take.

### Out of scope

- A control to reorder a double shift by hand.
- Open-shift staffing and recurring shifts, which add a second shift
  without this ordering.
