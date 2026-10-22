# Feature: Shared change model and formatter

**From build-plan:** feature 46a (parent 46, Clear shift-change descriptions)
**Status:** verified

## Goal

One pure function in `@dubgrid/schedule-core` turns a schedule cell's
original state and current state into a Before side and an After side that
every surface (46b to 46e) renders the same way: every field that tells the
two apart, 12-hour times with hours, highlights on what changed, whole-day
blocks for multi-item days, breaks between shifts that do not meet, and
plain-text and compact forms for email and push. No UI changes in this
feature.

## Design reference

- The "Shift change display" canvas:
  https://claude.ai/artifact/6AEf3RfYuGAGFvCDsLhEvA. The "Rules and sample
  week" board holds the seven sample changes this feature's tests encode;
  "Double shift changes" holds the multi-item, split-double and plain-text
  forms.
- The owner's rules (2026-10-20 and 2026-10-21), condensed:
  1. Each side is complete: shift, job (spelled out), times with hours,
     focus area; an absence says "all day" or "rest of day".
  2. 12-hour times (`7:00 AM - 3:00 PM`). A shift crossing midnight names
     both weekdays (`Wed 11:00 PM - Thu 7:00 AM`); same-day shifts carry no
     weekday. Never "(next day)".
  3. Hours on every shift line, `(8 hrs)`; an absence has none.
  4. Changed fields are marked on both sides; nothing is abbreviated to a
     shared prefix.
  5. Compared with the original: staff never saw the versions in between,
     and a change that nets back to the original is no change.
  6. A day with more than one item on either side lists the whole day per
     side in time order, with the day's total and Shift 1 / Shift 2 /
     Absence labels. Items pair by identity, not position.
  7. Added or removed items are tagged; an empty side reads "No shift".
     Archived definitions keep their name with "(archived)", never "?".
  8. Items are drawn touching only when their times meet; otherwise a break
     sits between them ("Break · 8 hrs, 3:00 PM - 11:00 PM").
  9. The arrow (`old → new`) is only for compact text such as push.

## In scope

- Types for the change model (load-bearing, see Data / contracts).
- Describing one item: title and detail parts, plain text, hours, overnight
  weekdays, archived suffix, absence scope.
- Pairing two days, highlights, statuses, labels, totals, "No shift", and
  the no-change result.
- Breaks between items and the day-bar geometry on one shared scale.
- An adapter from the stored `ScheduleCellState` plus name resolvers to the
  model's input, reading per-segment custom times positionally.
- Choosing the original: from a cell's ordered publish changes, the
  earliest "from" and the latest "to", or nothing when they match.
- Plain-text (Before/After lines) and compact (arrow) formatters.

## Out of scope

- Any rendering or consumer change: grid, dashboards, history, mobile,
  alerts and records adopt the model in 46b to 46e.
- Fetching data, and making mobile resolve archived definitions (46d).
- Changing how the schedule page, dashboard or mobile server merge publish
  history; they call the baseline helper when they adopt the model.
- `isNewAddition` flagging (stays where it is).
- The staff visibility setting (46f) and the 24-hour sweep (46g).
- "noon" and "midnight" wording: not decided; times stay `12:00 PM`.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Types and one item** - add `shift-change.ts` with the
      contract types and `describeShiftChangeItem`, which formats one shift or
      absence into title parts, detail parts and plain text. _Done when:_ tests
      pass for a day shift (`Day Shift · Registered Nurse` /
      `7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing`), an overnight shift dated
      Wed 2026-10-21 (`Wed 11:00 PM - Thu 7:00 AM (8 hrs)`), a shiftless job, a
      break deducted from hours, half hours (`7.5 hrs`), one hour (`1 hr`), an
      archived shift (`Weekend Day (archived)`), missing times (no time part, no
      hours), and absences (`Vacation (all day)`, `Sick (rest of day)`).
- [x] **Step 2 - One item each side** - `describeShiftChange(before,
after, { date })` returns `none` when the visible fields match, otherwise
      `single` when neither side has more than one item. The two items always
      pair, whatever their kinds; changed fields are marked on both sides
      (start, end, hours, shift, job, focus area, absence name or scope; the
      whole item when the kinds differ); an empty side gives the other item an
      added or removed status. _Done when:_ the six single-item sample-week
      cases from the canvas (Mon, Tue, Wed, Fri, Sat, Sun) give the expected
      marks and statuses, and identical days give `none`.
- [x] **Step 3 - Whole days** - when either side has more than one item,
      return `multi`: shifts pair through `alignSegmentsToBefore` by key and
      absences pair with each other; leftovers are removed or added; items get
      labels in time order (shift1, shift2, absence) and each side gets its
      day total. _Done when:_ Thursday (Day 7-3 and Evening 3-11, then Day 7-12
      and a rest-of-day Sick) gives Shift 1 changed, Shift 2 removed, Absence
      added and totals of 16 and 5 hours, and swapping the order of two
      identical shifts gives `none`.
- [x] **Step 4 - Breaks and the day bar** - mark a break before any shift
      whose start does not meet the previous item's end, with its length and
      times; a rest-of-day absence always meets the shift before it. Compute
      one bar scale over both sides (earliest start to latest end, overnight
      ends past midnight) and each item's start and end on it; a rest-of-day
      absence runs to the scale's end, and the scale extends to the end of the
      day if that would leave it no width. _Done when:_ tests cover Thursday
      (Day 7-3 and Evening 3-11, then Day 7-12 and Sick: no breaks, the bar
      runs 7:00 AM to 11:00 PM), the split double from the canvas (breaks of 8
      and 4 hours with their times, bar 7:00 AM to 7:00 AM the next day), and
      overlapping times (no break, no negative length).
- [x] **Step 5 - From a stored cell** - `cellStateToChangeDay(state,
resolvers)` builds the model input from a `ScheduleCellState`: segments
      in position order, custom times split per segment without dropping empty
      parts (falling back to the definition's default times), whole-day
      absence for `kind: "absence"`, rest-of-day absence for a worked cell's
      `absenceTypeId`, nothing for `deleted` or null, and the focus area by
      the same rule mobile's `buildPresentation` uses for
      `displayFocusAreaName`. A name the resolver cannot find never shows "?".
      _Done when:_ tests cover "07:00|15:00" style pipes, "|12:00" (only the
      second segment has a custom end), "Worked until" on the last segment, a
      worked cell with a rest-of-day absence, a whole-day absence, a deleted
      cell, a cell-level focus area override, and an unresolvable id.
- [x] **Step 6 - The original** - `selectOriginalCellChange(changes)` takes
      one cell's publish changes oldest to newest and returns the earliest
      `fromState` and the latest `toState`, or `null` when they describe the
      same cell (`isSameCellState`: kind, segments by shift and job,
      absence, custom times, focus area; mentoring is left out, see Notes). _Done when:_ tests cover
      Day then Evening then Night (Day to Night), a change back to the original
      (null), added then removed in the window (null), removed after a change
      (original to deleted), and a single publish (unchanged pass-through).
- [x] **Step 7 - Text forms and export** - `formatShiftChangePlain` gives
      the Before and After lines used by email and screen readers (with
      `Shift 1:`, `Absence:`, `(removed)`, `(added)`, `No shift`, and day
      totals on multi days); `formatShiftChangeCompact` gives the one-line
      arrow form for push. Export the module from `index.ts`, rebuild the
      package, and type-check both apps. _Done when:_ tests match the canvas's
      plain-text and push strings for Monday and Thursday,
      `npm --workspace @dubgrid/schedule-core run test` and its `type-check`
      pass, and `npm run type-check` passes at the root.

## Files / areas

- `packages/schedule-core/src/shift-change.ts` (new): types, item
  description, pairing, breaks, bar.
- `packages/schedule-core/src/shift-change-input.ts` (new): the cell-state
  adapter and the baseline helpers (`cellStateToChangeDay`,
  `selectOriginalCellChange`, `isSameCellState`).
- `packages/schedule-core/src/shift-change-text.ts` (new): plain and
  compact formatters.
- Colocated tests: `shift-change.test.ts`, `shift-change-input.test.ts`,
  `shift-change-text.test.ts`.
- `packages/schedule-core/src/index.ts`: three `export *` lines.
- Reused, not changed: `alignSegmentsToBefore` (`segment-alignment.ts`),
  `formatScheduleTimeValue` (`dates.ts`), `getRangeDurationMinutes`,
  `subtractBreakMinutes`, `toHoursValue`, `formatHoursLabel`
  (`schedule-time.ts`), `buildShiftJobPairKey` (`hours-assembly.ts`),
  `ScheduleCellState` (`@dubgrid/contracts`).

## Data / contracts

Load-bearing: 46b to 46e render these types, so names and meanings are
fixed here. No schema or API change.

```ts
// Input: one side of a day, already resolved to names.
type ShiftChangeItemInput =
  | {
      kind: "shift";
      key: string; // buildShiftJobPairKey(shiftId, jobId)
      shiftName: string | null; // null for a shiftless job
      jobName: string;
      shiftArchived?: boolean;
      jobArchived?: boolean;
      focusAreaName: string | null;
      start: string | null; // "HH:MM"
      end: string | null; // "HH:MM"; end <= start crosses midnight
      breakMinutes?: number;
    }
  | {
      kind: "absence";
      key: string; // "absence:<id>"
      name: string;
      archived?: boolean;
      scope: "allDay" | "restOfDay";
    };

interface ShiftChangeDayInput {
  items: ShiftChangeItemInput[];
} // [] = no shift

// Output.
interface ShiftChangeTextPart {
  text: string;
  changed?: boolean;
}

interface ShiftChangeItem {
  kind: "shift" | "absence";
  label: "shift1" | "shift2" | "absence" | null; // multi days only
  status: "same" | "changed" | "added" | "removed";
  title: ShiftChangeTextPart[]; // "Day Shift · Registered Nurse"
  detail: ShiftChangeTextPart[]; // "7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing"; [] for an absence
  plain: string; // title and detail joined, no marks
  minutes: number | null; // worked minutes; null for an absence or unknown times
  breakBefore: { minutes: number; start: string; end: string } | null;
  bar: { from: number; to: number } | null; // minutes on the shared scale
}

interface ShiftChangeSide {
  items: ShiftChangeItem[]; // time order; [] means "No shift"
  totalMinutes: number | null; // multi days only
}

interface ShiftChange {
  kind: "none" | "single" | "multi";
  date: string; // "YYYY-MM-DD"
  before: ShiftChangeSide;
  after: ShiftChangeSide;
  barScale: { start: string; end: string; minutes: number } | null; // multi days only
}
```

- `describeShiftChange(before: ShiftChangeDayInput, after: ShiftChangeDayInput, options: { date: string }): ShiftChange`
- `cellStateToChangeDay(state: ScheduleCellState | null, resolvers: ShiftChangeResolvers): ShiftChangeDayInput`,
  where the resolvers return a segment's names, archived flags, home focus
  area, default times and break for a (shiftId, jobId) pair, an absence
  type's name and archived flag, and a focus area's name.
- `selectOriginalCellChange(changes: Array<{ fromState: ScheduleCellState | null; toState: ScheduleCellState | null }>): { fromState; toState } | null`
- `formatShiftChangePlain(change: ShiftChange): string[]` and
  `formatShiftChangeCompact(change: ShiftChange): string`

Labels and statuses are data, not English, so each surface renders its own
copy ("Shift 1", "Absence", "Removed", "Added", "No shift", "Break").

## Testing

- Every step is pure logic with its own colocated Vitest file; the cases
  above are the done-whens. The sample-week cases use the canvas data
  (Maria Lopez, Registered Nurse, week of Mon, Oct 19, 2026).
- Commands: `npm run build:packages` once (schedule-core's tests need
  `@dubgrid/contracts` and `@dubgrid/domain` built), then
  `npm --workspace @dubgrid/schedule-core run test` and
  `npm --workspace @dubgrid/schedule-core run type-check`; root
  `npm run type-check` after the export in step 7.
- No browser evidence: nothing renders yet.

## Notes for the AI

- schedule-core is shared by web and mobile and must not import web types
  (`@/types`); it may import `@dubgrid/contracts` and `@dubgrid/domain`.
  Consumers read its compiled `dist`, so rebuild after export changes.
- Pair with `alignSegmentsToBefore`, not by index. Do not reuse
  `splitPipeParts`, which drops empty parts and shifts the per-segment
  positions; split pipes positionally.
- Hours deduct the definition's break, matching `getSegmentScheduledMinutes`,
  so the hours here agree with reports.
- Weekdays come from the cell's date string, never the machine's time zone.
- The publish-history TIME columns hold only the first segment's times; the
  adapter reads the state JSON's pipe strings instead.
- Return marks and labels as data; no English copy in the model except the
  shift, job, focus-area and absence names it is given, the times, and the
  hours unit inside `detail` and `plain`. The text formatters are the only
  English output.
- Org terminology: names arrive resolved; never hardcode a focus-area or
  certification term.
- Copy rules: "absence", never "off day"; no em dashes anywhere.
- An unresolvable definition reads "Unknown shift", "Unknown job" or
  "Unknown absence", never "?". Confirm this wording with the owner at the
  step 5 review.
- Mentoring is not shown on any change surface, so a mentoring-only edit
  would produce two identical-looking sides. Both `describeShiftChange` and
  `isSameCellState` ignore it; whether a mentoring change should be shown
  is an open question for the owner.
- Shared checkout: work only in this worktree
  (`.claude/worktrees/46a-shift-change`, branch
  `feature/46a-shift-change-model`). The striped-absence fix and other
  sessions edit the main checkout.
