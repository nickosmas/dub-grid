# Fix: Auto-build fills each week to five workdays, and Apply skips a needless re-check

**Type:** Fix
**Status:** verified
**Branch:** `fix/auto-build-fill-week` (cut from `dev` at abcb30f5)

## Problem

Seen in production (owner, 2026-10-24):

- Auto-build marks most of a week as days off for anyone whose recurring
  schedule covers only some days. The build takes a person's usual days from
  the weekdays their recurring schedule works, so a recurring schedule of
  Tuesday and Friday makes 2 their usual days: the top-up stops at 2 and the
  other 5 days get the day off absence, with nothing left blank. The owner:
  "The recurring schedule only provides what's recurring and you should fill
  in the rest of the empty days".
- Apply always shows "Checking the plan against the latest schedule", even
  when nothing has changed since Generate schedule, because it plans the
  whole build again before saving.

## Decisions (owner, 2026-10-24)

- Everyone's target is 5 workdays a week, whatever their recurring schedule
  covers. The recurring schedule fills first; the build fills the rest of the
  week up to 5, marks 2 days off (counting days off already there), and
  leaves blank only the days it cannot fill.
- A recurring schedule can hold absences too (owner): a recurring day off
  counts as one of the 2 days off, and another absence, such as vacation,
  counts as one of the 5 days, in the top-up as in the days off.

## Steps

- [x] **Step 1 - Five workdays for everyone** - the top-up target and the
      days off count use 5 a week for everyone; `usualDaysInAWeek` goes.
      _Done when:_ an adapter test shows someone with a two-day recurring
      schedule gets 2 days off and the rest blank when nothing else can be
      filled, and the build tops them up past their recurring days.
- [x] **Step 2 - Apply without a needless re-check** - Apply reuses the
      preview's plan when the schedule and the build's inputs are unchanged
      since Generate schedule, and plans again only otherwise, with a label
      that says it is looking for changes.
      _Done when:_ a headless browser Apply on an unchanged period never
      shows the checking step, and the panel test covers the label.

## Checks

- Web schedule and panel tests 306 pass, with new adapter tests: two worked
  days get 2 days off and 3 blank; a week whose recurring schedule already
  gives 2 days off gets none; the week count takes another absence as a day
  but not the day off absence.
- `npm run type-check` (web), eslint and prettier on the changed files,
  `docs:check:closed` after re-recording fingerprints.
- Headless browser on Calm Haven, Nov 1 to 14, with two temporary
  requirements and temporary recurring schedules: Kevin Donovan (Tue and Fri
  only) got 5 days and 2 days off each week; Barbara Trent (Tue and Fri, days
  off Sun and Sat) got 5 days and no more days off; Carol Henderson (Mon, and
  Vacation Wed) got 4 days, the vacation and 2 days off. Nobody got more
  than 2 days off a week. The report reads "Up to 5 days a week". Undo
  emptied the period; the temporary rows were removed.
- Apply skipped the re-check in four of five runs on the same period; the
  first, on a cold dev server, saw the schedule refresh after Generate and
  checked again, as it should. A temporary log confirmed the reuse
  conditions held in the others.

## Notes for the AI

- Never reseed or reset the shared local stack; remove temporary data on
  Calm Haven after the check.
