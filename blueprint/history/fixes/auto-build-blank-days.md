# Fix: A short week keeps its missing workdays blank; restores keep the day limits; top-up stays in the period

**Type:** Fix
**Status:** verified
**Branch:** `fix/auto-build-blank-days` (cut from `dev` at cb53f3dd)

## Problem

- Auto-build marks every empty day it leaves with the day off absence. When it
  cannot bring someone up to their usual days in a week, the days it could not
  fill read as days off, so nobody can see the person is short. The owner
  (2026-10-23): those days "should actually be left blank".
- F-129: a Restore or Move back from a build or the suggestion list never
  checks the 5-in-a-week and 5-in-a-row limits.
- F-130: the top-up reads every loaded date (about 90 days either side), so it
  tops up people with no shift in the period and runs several times slower.

## Decisions (owner, 2026-10-23)

- In a week where someone is short of their usual days, mark only their usual
  days off with the day off absence (7 less their usual days), and leave one
  blank day per missing workday. Days off go on the days that keep them
  together; the later empty days stay blank.
- Fix F-129 and F-130 in the same change.

## Steps

- [x] **Step 1 - Blank days** - `planDaysOff` takes each person's usual days
      and, per Sunday-to-Saturday week, leaves `usual - worked - away` empty
      days blank (an absence other than the day off absence counts as away);
      the rest get the day off absence, placed next to other days off first.
      The preview lists the blank days, and the report names them per person.
      _Done when:_ adapter tests cover a full week, a short week, an absence
      that counts as away, an existing day off, and pairing; a panel test shows
      "1 day left blank".
- [x] **Step 2 - F-129** - the engine input takes an optional work-limit check;
      Restore and Move back skip any day they would add past the limits,
      counted with the planned days. The web adapter supplies the check.
      _Done when:_ the audit's reproduction is an engine test that now passes,
      and an adapter test shows the check.
- [x] **Step 3 - F-130** - the top-up takes its dates from the period.
      _Done when:_ an engine test whose loaded dates reach past the period
      leaves alone someone with no shift in it.
- [x] **Step 4 - Docs** - the Auto-build guide.

## Checks

- schedule-core 286 pass, including the F-129 and F-130 tests, which fail on
  the old code; web schedule and panel tests 312 pass.
- Headless browser on Calm Haven (Nov 1 to 14, temporary requirements and an
  "Only Evening" preference for Kevin Donovan with Evening needed Mondays and
  Tuesdays only): 31 people got 5 days and 2 days off in each week; Kevin got
  Mon and Tue, Wed and Thu off, and Sun, Fri and Sat blank in both weeks. The
  report read "Kevin Donovan 4 shifts · 4 days off · 6 days left blank". Undo
  emptied the period, and the requirements and preference were removed.
- `npm run type-check`, eslint and prettier on the changed files,
  `docs:check:closed`.
- An independent review of the branch confirmed F-129 and F-130 repaired
  without a new defect, and found that a day a move back empties got neither
  a day off nor a blank; it now counts as empty and stays blank (adapter
  test). Known days off before the period are now only days already past.

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check.

## Findings

### auto-build-blank-days/F-129 [P1] closed - A build or suggestion that restores or moves back a shift can give a sixth day in a week or in a row

**File:** `packages/schedule-core/src/coverage-suggestions.ts:337` (`draftUndoSuggestions`); limits enforced only in `availability`, `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts:263` (`overWorkLimits`)
**Found:** 2026-10-23 by /audit (scope: schedule builder algorithm; all lenses)
**Why it matters:** The owner's rule is at most 5 days in a Sunday-to-Saturday week and 5 in a row (6 with the option, never 7) for builds and suggestions. The limits live only in `availability`, which assign suggestions consult; Restore and Move back never call it, and `clashes` only stops a second write to the same day. Reproduced on the real engine with an availability that refuses any sixth day: the draft had taken Ben's Wednesday shift off (published Mon to Fri); Auto-build first assigned him Saturday (his 5th day that week), then restored Wednesday, leaving him on Mon to Sat, 6 in a week and 6 in a row. The assign ranks first because it closes a cell while the restore only fills one. The suggestion list's Restore can do the same to a draft the scheduler edited, and with "Allow 6 days" off nothing reports the sixth day.
**Suggested fix:** Before keeping a Restore or Move back, check each day it adds work to against the same week and row limits (the planner's `availabilityWith`, or a limits callback on the input), and skip it with a `workWeek` or `workRun` reason. Add an engine test with the scenario above.
**Resolution:** Fixed on fix/auto-build-blank-days. The engine input takes an optional `workLimit`, and `draftUndoSuggestions` skips a Restore or Move back when a day it adds work to would break it, counted with the planned days (the planner's `current` already carries them). The web adapter supplies `workLimitWith`, using the same limits as availability (6 with the option). The audit's reproduction is now an engine test ("never restores a shift that would make a sixth day after a build's own assign"), which fails on the old code. Re-reviewed 2026-10-23 by an independent review of the branch (cb53f3dd..2ac1335f): the defect is gone, traced through the planner and the suggestion list, and the repair introduced no new one.

### auto-build-blank-days/F-130 [P2] closed - Auto-build's top-up counts every loaded date, not the period, so it tops up people with no shift in the period and runs about 130 times slower

**File:** `packages/schedule-core/src/coverage-suggestions.ts:1025` (`topUpSteps`: `dateKeys` from `input.dateKeys`); `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts:681` (`dateKeys: input.loadedDateKeys`, the page's window of about 90 days either side)
**Found:** 2026-10-23 by /audit (scope: schedule builder algorithm; all lenses)
**Why it matters:** The decision recorded for the top-up (fix five-days-a-week-top-up) is that only people who work a day in the period are topped up, as with days off. `input.dateKeys` is every loaded date, so anyone with a shift anywhere in the six-month window passes the filter and is given up to 5 days a week in the period, for example someone with nothing scheduled in the period but shifts last month. Reproduced: with a loaded date outside the period, a person with no shift in the period got shifts; with the period's dates only, none. The same loop scans about 26 weeks each step: on the 40-person two-week grid from the speed test, the build took 1.7 s with period dates and 6.9 s with the window loaded, for the same 141 fixes, and Apply plans it all again. The engine test passes only because its fixture loads exactly the period.
**Suggested fix:** Take the top-up's dates from `current.matrix.dateKeys` (filtered by `options.dateKey`), and add a test whose `dateKeys` reach past the period.
**Resolution:** Fixed on fix/auto-build-blank-days: the top-up takes its dates from `current.matrix.dateKeys`. A new engine test loads a date outside the period where the person has their only shift and expects no top-up; it fails on the old code. Re-reviewed 2026-10-23 by an independent review of the branch (cb53f3dd..2ac1335f): the defect is gone, traced through the planner and the suggestion list, and the repair introduced no new one.
