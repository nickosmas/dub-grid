# Feature: Work-limit warnings in the shift editor

**From build-plan:** feature 60a
**Status:** verified
**Branch:** `feature/60a-work-limit-warnings` (cut from `origin/dev` at d6cb5c327)

## Goal

A scheduler who fills a cell by hand is warned, never blocked, when the
day gives the person more than 5 days in a row, more than 5 days in their
Sunday-to-Saturday week, or more than 40 hours in that week. The counts are
the ones Auto-build already uses, so the run counts days in the period
before and the period after. 60a also builds the shared check that 60b
(publish) and 60c (request approval, web and mobile) reuse.

## Decisions (owner, 2026-11-27)

- **Limits:** more than 5 days in a row (across weeks and periods), more
  than 5 days in a Sunday-to-Saturday week, more than 40 hours in that
  week. The constants already exist: `MAX_DAYS_IN_A_ROW`,
  `MAX_DAYS_IN_A_WEEK`, `WEEKLY_OVERTIME_HOURS` in
  `packages/schedule-core/src/hours-assembly.ts`.
- **Warn, never block.** On screen only: no alert, push or email.
- **Shift editor:** the warning joins the one warning banner under the
  shift that item 58 put there, one item per limit crossed.
- **Mobile approvals are in scope for 60c**, so the check lives in
  `@dubgrid/schedule-core`, not in `apps/web`.

## Defaults (proposed here, change before building if wrong)

- A worked day is a day with a shift. An absence alone is not one, as in
  Auto-build's run count.
- The count reads the draft as it would publish: draft edits first, then
  the published day, on every loaded date (the page loads 90 days either
  side; the counter looks 10 days each way).
- No warning on a past day being corrected (53b): past days record what
  happened. No warning for an absence-only cell or an open shift.
- "Allow a sixth day in a row" stays an Auto-build option and doesn't
  silence the editor.
- Copy, in item 58's two-line shape (lead, then a label and a bold value):
  - "This makes 6 days in a row for Ana." / "Days in a row: **Wed, Nov 25
    to Mon, Nov 30**"
  - "This makes 6 days in Ana's week." / "Week: **Sun, Nov 29 to Sat,
    Dec 5**"
  - "This makes 42.5 hours in Ana's week." / "Week: **Sun, Nov 29 to Sat,
    Dec 5**"

## In scope

- One shared, pure check in `@dubgrid/schedule-core` that names each limit a
  day crosses, with the run's or week's dates.
- The schedule page computing it for the open cell from the draft.
- The shift editor showing it in the existing warning banner.

## Out of scope

- The publish confirmation (60b) and request approvals on web and mobile
  (60c).
- Grid marks, the Staffing check, notifications of any kind.
- Changing how Auto-build or suggestions count or plan.
- Rest rules (time between shifts).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Move the day counters into schedule-core** - move
      `daysInARowWith` and `daysInWeekWith` from
      `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts` to a new
      `packages/schedule-core/src/work-limits.ts`, exported from the package
      index; the web file re-exports them so no caller changes. No behavior
      change. _Done when:_ `npm run build:packages`, `npm run type-check` and the
      existing coverage-suggestions tests pass unchanged.
- [x] **Step 2 - The shared check** - in `work-limits.ts`, add
      `workLimitBreaks({ worked, weekHours, dateKey })` returning
      `WorkLimitBreak[]`: the run around the date when it is longer than
      `MAX_DAYS_IN_A_ROW` (with its first and last date), the
      Sunday-to-Saturday week when it has more than `MAX_DAYS_IN_A_WEEK` worked
      days, and the same week when `weekHours` is over `WEEKLY_OVERTIME_HOURS`.
      An unworked date returns nothing. Hours come from the caller so web and
      mobile each pass their own hours source. _Done when:_ unit tests cover a
      run crossing a period start, a run crossing a week end, exactly 5 days
      (no break), a sixth and a seventh day, 40.0 hours (no break) and 40.5
      hours, and an unworked date.
- [x] **Step 3 - Warning copy** - a pure `workLimitWarnings(breaks,
firstName)` beside `preferenceWarnings` in
      `apps/web/src/components/schedule/shift-preference-notes.tsx`, returning
      the existing `PreferenceWarning` shape with the copy above (12-hour dates
      as the app formats them, hours rounded as the Auto-build report rounds
      them). _Done when:_ unit tests pin each line's text, including a half-hour
      total and a run spanning two months.
- [x] **Step 4 - Shift editor** - `SchedulePageClient` computes the breaks
      for the open cell's person and date from the draft shifts (through a new
      `workLimitBreaksInDraft`, which reads the draft with Auto-build's own
      `workedWith`, and `weekHoursWithPlanned` for
      hours) and passes them to `ShiftEditPanel` as a new optional
      `workLimitBreaks` prop; the panel adds their warnings to the banner in
      `renderCurrentShiftWithPreferences`. Nothing for past days, absence-only
      cells or open shifts. _Done when:_ in the browser, with Ana working the
      last 5 days of one period, giving her the next period's first day shows
      "This makes 6 days in a row for Ana." with the run's dates; removing the
      shift clears it; a sixth day in one week and a week over 40 hours each
      show their own line; a past day, an absence and an open shift show none;
      saving is never blocked. Screenshots of each.

## Files / areas

- `packages/schedule-core/src/work-limits.ts` (new) and its test, the
  package index
- `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts`
  (re-exports only)
- `apps/web/src/components/schedule/shift-preference-notes.tsx` and its test
- `apps/web/src/components/ShiftEditPanel.tsx` (one prop, one banner)
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` (compute and
  pass the breaks)
- `docs/features/schedule-grid.mdx` (Work limits) and the evidence
  fingerprints in `internal/documentation/accuracy-manifest.json`

## Data / contracts

- No migration, no API change.
- **Load-bearing:** `WorkLimitBreak` in `@dubgrid/schedule-core`, which 60b
  and 60c (mobile included) read:

  ```ts
  type WorkLimitBreak =
    | { limit: "row"; days: number; start: string; end: string }
    | { limit: "week"; days: number; start: string; end: string }
    | { limit: "hours"; hours: number; start: string; end: string };
  // start/end are YYYY-MM-DD; for week and hours, the Sunday and Saturday.
  ```

## Testing

- Vitest: `work-limits.test.ts` (step 2) and the copy tests (step 3). Steps 1
  and 4 ride on the existing suites, type-check and browser evidence.
- Browser (step 4): local Calm Haven with a QA account, never Arden Wood.
- Commands: `npm run build:packages`, `npm run type-check`, `npm run test`,
  `npm run lint`.

## Notes for the AI

- Never reimplement the counters: Auto-build, suggestions and this warning
  must agree on every count. Step 1 moves code, it doesn't copy it.
- `packages/schedule-core` must not import from `apps/web`; rebuild the
  package after changing its exports.
- Copy: "absence", never "off day"; no em dashes; neutral banner text with
  the warning tone icon, as item 58's.
- The banner stays one banner however many lines it holds.
- Work in `/tmp/dg-60a`, never in the shared checkout.
