# Feature: Worked until limits

**From build-plan:** feature 50a
**Status:** verified
**Completed:** 2026-10-24

## Goal

"Worked until" can only record a time when the shift really was cut short:
after the last shift starts and before its scheduled end. Today it accepts
any time, so 6:45 AM on a 7:00 AM - 3:00 PM shift counts 23.75 hours, a time
after the scheduled end adds silent overtime, and adding an absence without
touching the field saves an absence that covers no time. Removing the absence
also leaves the shift shortened. 50a closes these on the current data model,
before the redesign (50b onward) gives the absence its own times.

## Design reference

The "Absence beside a shift" canvas,
<https://claude.ai/artifact/9nZXQZhWYybGo33LXqeoH1>, board "What can't be
saved": "Just added: no time yet", "Worked the whole shift", "Times stay
inside the shift" and "Removing the absence". 50a keeps today's "Worked
until" label and hour, minute and AM/PM dropdowns; the "Left at" field,
"Left early / Arrived late" choice and "never started" button belong to 50c.

## In scope

- One shared check of a Worked until time against the last shift's start
  and scheduled end, overnight shifts included.
- The panel's Worked until field: a prompt while no time is set, an error
  for a time outside the shift, and "Save changes" disabled in both cases.
- Adding an absence no longer counts as "worked until the scheduled end";
  the field starts unset.
- Removing the absence puts the last shift back to its scheduled times, and
  the confirmation says so.
- The Schedule Grid docs page's Worked until sentence.

## Out of scope

- Storing the absence's own start and end, and refusing a bad cell on the
  server (50b, where the stored times make the check possible there).
- "Left at" / "Arrives at", an absence before a shift, removing a later
  shift that wasn't worked, and "never started" becoming a whole-day absence
  (50c).
- Grid pills, print and every other surface (50d onward). Cells saved before
  50a with a full-shift absence keep drawing as today; opening one in the
  panel shows the error (or the unset prompt, when its time was never
  touched) and any save from that panel waits until the time is fixed or the
  absence is removed.
- Drag, copy and paste keep times exactly as they are today.

## Data / contracts

- **No migration, no contract change.** The last segment's custom end (the
  pipe-joined `customEndTime`) is still the Worked until time.
- **"Unset" is a null custom end on the last segment.** With an absence
  present, a null end no longer reads as "worked until the scheduled end";
  it means no time has been chosen yet.
- **The shared check** (load-bearing; 50b and 50c reuse it, so it lives in
  `apps/web/src/components/shiftEditTime.ts` beside `withLastShiftEnd`):

  ```ts
  type WorkedUntilProblem = "unset" | "no-time-covered" | "outside-shift";
  /** Null when the time is strictly after start and strictly before the scheduled end. */
  function workedUntilProblem(args: {
    start: string | null; // the last shift's effective start, "HH:MM"
    scheduledEnd: string | null; // its default end, "HH:MM"
    workedUntil: string | null; // the last segment's custom end, "HH:MM"
  }): WorkedUntilProblem | null;
  ```

  Times are compared as minutes after the shift's start, so a shift that
  crosses midnight (11:00 PM - 7:00 AM) accepts 3:00 AM. On that wrapping
  scale a time before the start cannot be told from one after the end, so
  both are `outside-shift`, as is the start itself; exactly the scheduled
  end is `no-time-covered`, the case where someone worked the whole shift.
  With no known start or scheduled end (a shift with no default times), only
  `unset` applies.

- **Removing the absence** clears the last segment's custom start and end
  (both, since `withLastShiftEnd` filled the start), so it reads its
  scheduled times again. Other segments' custom times are untouched.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - The shared check and the clear helper.** Add
      `workedUntilProblem` and `withoutLastShiftTimes(customStartTime,
customEndTime, shiftCount)` to `shiftEditTime.ts`, with tests.
      _Done when:_ tests show, for 7:00 AM - 3:00 PM: 11:00 AM passes;
      3:00 PM is `no-time-covered`; 7:00 AM, 6:45 AM and 5:00 PM are
      `outside-shift`; null is `unset`. For 11:00 PM - 7:00 AM, 3:00 AM
      passes, 7:00 AM is `no-time-covered` and 10:00 PM is `outside-shift`.
      With no scheduled end only `unset` is reported. `withoutLastShiftTimes` clears
      only the last pipe part for one and two shifts and returns null when
      nothing is left.
- [x] **Step 2 - The field shows the problem and Save waits for a time.**
      `WorkedUntilField` takes the problem and the shift and person names:
      unset shows empty dropdowns and "When did <first name> leave the
      <shift> shift?"; `no-time-covered` shows "The <shift> shift ends at
      <time>, so <absence> would cover no time. Set when <first name> left,
      or remove <absence>."; `outside-shift` shows "Pick a time after the
      <shift> shift starts at <start> and before it ends at <end>." Both
      errors use the danger colour and
      `aria-invalid`. The panel adds the problem to `confirmBlocked`, and
      picking a time no longer refuses silently.
      _Done when:_ `ShiftEditPanel.test.tsx` shows each message, "Save
      changes" disabled for each problem and enabled for 11:00 AM, the
      "Hours count to" line only for a valid time, an overnight Night shift
      accepting 3:00 AM, and changing the shift to one the time falls
      outside of showing the error; for two shifts the check uses the
      second.
- [x] **Step 3 - Adding an absence starts unset; removing it restores the
      shift.** Picking an absence clears the last segment's custom end (so
      the field asks for a time) unless one is already set before the
      scheduled end. Removing it applies `withoutLastShiftTimes`, and the
      dialog adds "The <shift> shift goes back to <start> - <end> (<n>
      hrs)."
      _Done when:_ component tests show adding Sick to a plain Day shift
      blocks Save with the unset prompt; adding it to a shift already
      ending at 11:00 AM keeps 11:00 AM; removing it leaves no custom time
      on that shift and the confirmation names its scheduled times; Undo
      brings back both.
- [x] **Step 4 - Docs and browser check.** Update the Worked until
      sentence in `docs/features/schedule-grid.mdx` (it must be after the
      shift starts and before it ends) and re-record its fingerprint. On the
      local grid (worktree dev server): add Sick to a Day shift, see Save
      blocked, pick 6:45 AM and 3:00 PM and see each error, pick 11:00 AM
      and save (grid shows 4 hrs), then remove Sick and see 7:00 AM - 3:00
      PM again.
      _Done when:_ screenshots of each state, no console errors, and
      `npm run docs:check` passes.

## Files / areas

- `apps/web/src/components/shiftEditTime.ts` (+ `shiftEditTime.test.ts`)
- `apps/web/src/components/PillTimeEditor.tsx` (`WorkedUntilField`)
- `apps/web/src/components/ShiftEditPanel.tsx` (`renderWorkedUntil`,
  `confirmBlocked`, the absence pick and remove paths)
- `apps/web/src/__tests__/ShiftEditPanel.test.tsx` (or the existing panel
  test beside it)
- `docs/features/schedule-grid.mdx`, `internal/documentation/accuracy-manifest.json`

## Testing

- Logic: `workedUntilProblem` and `withoutLastShiftTimes` unit tests. The
  headline cases are 6:45 AM (today 23.75 hours) and 3:00 PM (today an
  absence covering nothing); both must be refused.
- Panel behaviour: component tests, as 45b's panel steps did.
- Browser: step 4, on a worktree dev server against the local database
  (QA super admin, Calm Haven); restore any shift it changes.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run build`, `npm run docs:check`.

## Notes for the AI

- Copy names the shift as "the Day shift", never a bare "Day" in a
  sentence; the absence and person names come from the absence type and
  the employee (first name), never hardcoded.
- Times shown are 12-hour with tabular numerals; no em dashes in copy.
- Keep the dropdowns' 5-minute steps; the check rejects the boundary times
  rather than hiding options, so the field never jumps on its own.
- `withLastShiftEnd` still fills the start from the default when a time is
  picked; leave that, and clear both on removal.
- Work in your own worktree; relink `@dubgrid` per entry and build packages
  there before running web tests (stale main-checkout `dist` otherwise).

## Completion notes (2026-10-24)

- **Evidence:** `shiftEditTime.test.ts` covers the check (6:45 AM and the
  scheduled end refused, 11:00 AM and an overnight 3:00 AM accepted) and the
  clear helper; `ShiftEditPanel.test.tsx` covers the prompt, both errors,
  the Save block, two shifts, a changed shift, adding (unset, cleared at the
  scheduled end, kept before it), removing (times restored, the dialog's
  sentence) and Cancel bringing both back. Type-check, lint (0 errors) and
  `npm test` across every workspace pass; the production build ran from the
  main checkout after the squash, since Turbopack refuses a worktree's
  linked `node_modules`; `npm run docs:check` passes.
- **Browser check** (worktree dev server, local Calm Haven, QA super admin):
  on Nancy Thornton's Wed 10/21 Day shift (7:00 AM - 3:30 PM), adding Sick
  left Worked until empty with "When did Nancy leave the Day Shift?" and
  Save disabled; 6:00 AM and 6:45 AM showed the outside-the-shift error and
  3:30 PM the "would cover no time" error, all with Save disabled; 11:00 AM
  showed "Hours count to 11:00 AM", the After side at 4 hrs, and saved as
  D 7-11 joined to S from 11; removing Sick asked "The Day Shift goes back
  to 7:00 AM - 3:30 PM (8.5 hrs)" and restored those times. The draft was
  discarded afterwards, leaving the cell as published. The only console
  errors were the dev server's hot-reload socket.
- **Behaviour change on open:** a cell saved earlier with a full-shift
  absence now opens with the error (or the unset prompt) and its panel
  can't save until the time is fixed or the absence removed; the grid keeps
  drawing it as before until 50b and 50d.
- **Docs:** the Schedule Grid page states the limit and the restore; the
  manifest claim says "Worked until inside the shift, removing it restores
  the shift", and three pages citing the panel were re-recorded.
