# Fix: Any two different shifts can make a double shift

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

### The problem

A double shift is two shifts in one day for one person. Every one of these
pairs should be allowed:

- a general shift (a shiftless job) plus a regular shift;
- two different general shifts;
- two different regular shifts.

The server and the database already accept every pair. Overlapping times
are refused only when the organization turns on conflict prevention
(`assert_non_overlapping_work_assignment_times`). The web shift editor is
what blocks them, in `apps/web/src/components/ShiftEditPanel.tsx`:

1. **The second-shift picker filters too hard** (`pickerAssignmentDefinitions`,
   around line 838). Once the first shift has an end time, the picker:
   - never offers a general shift (`if (sc.isGeneral) return false`);
   - drops any shift with no default start time;
   - offers only shifts that start at or after the first shift ends. An
     earlier shift can't be added second (pick Evening first and Day never
     appears), and handoff overlaps such as 06:45-15:15 plus 14:45-23:15
     are hidden even when the organization doesn't enforce conflicts.

   When the first shift has no end time, the filter is skipped entirely and
   the first shift is offered again.

2. **"Add another shift" is hidden** when the first shift has no resolvable
   end time (around line 3880). So a general shift in duration mode, or a
   shift without times, can never get a second shift.
3. **The empty state is wrong.** It says "No shifts start at or after
   {time}", which stops being true once the time rule is gone.

### The fix

When a second shift is being added, the picker offers every assignment
except the one already chosen. Absences stay off the list, as today.
"Add another shift" shows for any single worked shift, whatever its times.
Overlaps are left to the checks that already handle them:

- the editor's same-day overlap warning (`checkSameDayOverlaps` in
  `SchedulePageClient.tsx`), which blocks saving only when conflict
  prevention is on;
- the database guard, which refuses an overlap under the same setting.

The two shifts are stored in time order, whichever was picked first, so
the grid reads `D/E` rather than `E/D`. A shift without a start time sorts
after a timed one. Custom times move with their shift.

It must not break:

- the published-shift "new" ring and badge on a shift added beside a
  published one (`countShiftsAddedToPublishedCell`, the panel's per-shift
  new badge);
- per-shift schedule notes and the mentored toggle on a double shift;
- the existing maximum of two shifts per cell;
- the existing `ShiftEditPanel` tests, including "preserves the current
  shift when adding a second shift".

### Build steps

- [x] **1. The picker offers every other shift.** In `ShiftEditPanel.tsx`,
      replace the time filter with "every assignment except the first
      shift", drop the end-time condition on "Add another shift", and give
      the empty state true copy (for example "No other shifts to add.").
      Remove whatever this leaves unused (`firstShiftEndTime`, the local
      `timeToMinutes` if nothing else needs it).
      _Done when_ new `ShiftEditPanel.test.tsx` cases show that, while a
      second shift is being added: - a regular first shift lists general shifts, a shift that starts
      earlier, a shift that overlaps, and a shift without times; - a general first shift (duration mode, no times) shows "Add another
      shift" and lists regular shifts and other general shifts; - the first shift and absences are never listed; - each pick calls `onSelect` with both segments.
- [x] **2. The two shifts are kept in time order.** When the second shift
      is added, order the pair by effective start time (custom time, then
      the assignment's default, then its shift's time; no time sorts last),
      re-index `position`, and reorder the `|`-joined custom start and end
      times with them. `countShiftsAddedToPublishedCell` matched published
      shifts by position, so an earlier shift added in front of a published
      one counted as an edit while its pill showed new; it now matches them
      by shift and job through `alignSegmentsToBefore`, as the pills do.
      _Done when_ a test adds Day to a cell holding Evening and `onSelect`
      receives Day at position 0 and Evening at position 1, and a test with
      a custom time on the first shift shows that time still attached to
      that shift after reordering.

### Verify

- `npm run type-check`, `npm run lint` and `npm run test:web` pass.
- In the browser, as a manager on the Schedule page:
  - give someone Evening, then add Day: the cell reads Day then Evening;
  - give someone a regular shift, then add a general shift;
  - give someone a general shift, then add a different general shift;
  - with conflict prevention on in Settings > Schedule Rules, two
    overlapping shifts show the overlap warning and can't be saved; with it
    off, they warn and save.
- Publish one of these double shifts and confirm the grid and the mobile
  shift detail show both shifts.

### Evidence

- `npm run test:web` from the worktree: 641 files, 5,728 tests passed. The
  new `ShiftEditPanel`, `orderSegmentsByStartTime` and
  `countShiftsAddedToPublishedCell` tests fail on the previous code.
- `npm run type-check` (24 tasks) and `npm run build` (91 pages) passed
  from the worktree with hardlinked `node_modules`; `eslint` on every
  changed file passed.
- `npm run docs:check` passed after `docs:fingerprint -- --write schedule-grid
shift-requests`; both pages' claims about the shift panel were re-read
  against the new code and still hold.
- Browser, worktree dev server on Evergreen Care (Calm Haven's local trial had
  expired, which locks it on billing): "Add another shift" appears under an
  untimed Office shift, the picker offers only Partial, and Office plus
  Partial saves as a double shift. Undone afterwards.
- Not observed in a browser: regular-shift pairs (no local Evergreen employee
  can take one) and the overlap warning with conflict prevention on; the
  unit tests cover the first.
- Not in scope and unchanged: open-shift staffing and recurring shifts append
  a second shift without time ordering.

### Out of scope

- Three or more shifts in a day.
- Recurring shifts, drag and drop, and copy and paste, which don't add a
  second shift through this picker.
- Changing what counts as an overlap, or the conflict-prevention setting.
