# Feature: Suggestion engine

**From build-plan:** feature 47c (parent 47, Staffing check)
**Status:** verified
**Branch:** `feature/47c-suggestion-engine` (cut from `dev` at 2adecb34)

## Goal

A tested `@dubgrid/schedule-core` function that looks at Coverage Check's
matrix and proposes ways to fix its gaps: move back a shift the draft moved
away, restore a shift the draft removed, schedule a qualified person who is
free, or approve a pickup request already waiting. Every suggestion is
measured by applying it to a copy of the schedule and counting coverage
again with the same engine, so what it says it fixes is exactly what it
fixes, and no suggestion fixes one gap by opening another. For each short
cell it also says why every other qualified person was not suggested.
Nothing is shown yet; 47d puts this in the panel.

## Design reference

- The "Staffing check panel" canvas,
  https://claude.ai/artifact/KSPPPawq4W1E89ZUJNdmAT: the suggestion list
  (title, detail, effect line), Ways to fix and Not suggested. 47c produces
  their content; 47d draws them.
- Where the canvas and the owner's decisions differ, the decisions win:
  - **No weekly hours limit and no minimum rest rule** (owner, 2026-10-21),
    so the canvas's "40 of 40 hours", "48 hours (overtime)", "16 hours in a
    row" and "24 hours off" lines do not exist here.
  - **A person fits when qualified and free that day**: the same
    qualification and overlap rules as the Fill a spot dialog, plus not on
    an absence that day (the dialog offers absent people because assigning
    replaces the absence; a suggestion never overrides time off).
  - The canvas's "Assign both" (one person for two cells) is two
    suggestions here; 47d may group them.

## In scope

- A new `packages/schedule-core/src/coverage-suggestions.ts` and a text
  module beside it, with the contracts below.
- Measuring a suggestion: re-running `computeCoverageCategorySnapshots` on
  the changed dates with the changed days, and comparing cell by cell.
- Five kinds: move back, restore, schedule (assign), approve a pickup, and
  a repeating gap with no fix (information only).
- Not suggested: one reason per qualified person in the focus area for each
  short cell.

## Out of scope

- Any UI, the web adapter that feeds the engine real data, applying,
  undoing and approving (47d).
- Weekly hours, overtime and rest between shifts (owner, 2026-10-21).
- Moving someone off a shift they work elsewhere the same day to fill a gap
  (the canvas's "Paul Henderson ... would then be short" reason): only free
  people are suggested.
- Grouping suggestions that touch the same person (47d).

## Build steps

- [x] **Step 1 - Measuring a change** - `coverage-suggestions.ts` exports
      the contracts below and `measureCoverageChange(input, overrides)`:
      given the base coverage input, the draft and published day lookups,
      the mentored credit and a list of day overrides, it recomputes
      snapshots only for the dates the overrides touch, on each side they
      touch, and returns one `CoverageCellEffect` per cell whose count
      changes, plus the totals `closes`, `opens`, `filled`, `worsened` and
      `clearsOver` over cells that have not started.
      _Done when:_ unit tests show adding a person closes a gap, removing
      one opens it, a mentored add fills half, a change counting in two
      rows reports both, a published-side override changes only
      `published`, an override on a started cell is reported but not
      counted, and measuring no overrides returns nothing.
- [x] **Step 2 - Move back and restore** - `suggestCoverageFixes(input)`
      starts with the draft's own changes: for each short, not-started cell,
      every `contributorChanges` loss (47b) becomes a candidate. A shift
      that moved to another loaded date, or changed to other work, becomes
      **move back** (each changed date returns to its published day); a
      shift taken off with no draft absence and no request on that day
      becomes **restore** (the day returns to published). Each is measured,
      and kept only if it closes or fills a gap and opens and worsens none.
      _Done when:_ tests cover a move back that closes a gap and clears an
      over, a move back dropped because its other day would go short, a
      change of work moved back, a restore, a removal with a request (no
      restore), a removal that became an absence (no restore), and a loss
      on a started day (nothing).
- [x] **Step 3 - Schedule and approve** - for each short, not-started cell,
      every active person in the focus area who is qualified for one of the
      cell's assignments (its short jobs first, then its preferred one) and
      is not counted there is checked with `availability`: a free person
      becomes **assign** (their draft day plus the assignment). Each pending
      pickup for the cell (same date, focus area and an eligible
      assignment) becomes **approve** (`final`, both sides change) when its
      requester is still free. Everyone qualified and not suggested gets a
      `CoverageRuledOut` reason. Same keep rule as step 2.
      _Done when:_ tests cover a free person suggested, someone already
      counted (neither suggested nor ruled out), each availability reason
      ruled out, an unqualified or inactive person left out entirely,
      someone in another focus area left out, an approval that publishes,
      an approval whose requester is busy (ruled out with the reason), and
      a person who fits two cells the same day (suggested for both).
- [x] **Step 4 - Ranking and repeating gaps** - suggestions sort by gaps
      closed, then staff added to short cells, then kind (move back,
      restore, approve, assign), then the earliest date, then name; ids are
      stable. A row short on the same weekday in two or more weeks of the
      window, with no suggestion for any of those cells, gets one
      **pattern** suggestion with no changes.
      _Done when:_ tests cover the order, a stable id across two runs, a
      pattern found, a pattern skipped because one of its days has a fix,
      and a single short weekday (no pattern).
- [x] **Step 5 - Words** - `coverage-suggestion-text.ts` turns each
      suggestion and ruled-out entry into the lines 47d shows, worded as in
      **Suggestion lines** below, from the same lookups as 47b.
      _Done when:_ a test per line in the tables.
- [x] **Step 6 - Speed** - a fixture the size of a two-week Calm Haven
      grid (40 people, 6 requirement rows, 14 days, about 30 short cells)
      runs `suggestCoverageFixes` within 150 ms in Vitest, and two runs
      return the same result.
      _Done when:_ the test passes three runs in a row.

## Evidence (2026-10-22)

- 40 engine and text tests over the real coverage engine, all passing.
- Speed: on the seeded two-week grid (40 people, 6 rows, 14 days, 47 short
  cells) `suggestCoverageFixes` took 47 to 53 ms per run (5 runs), giving
  433 suggestions (9 restores, 424 assigns) and 398 Not suggested lines; the
  150 ms test passed three runs in a row, and two runs return the same
  result.

## Suggestion lines

| Kind      | Title                                                   | Detail                                                                                  |
| --------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Move back | "Move {Name}'s {Shift} back to {Wed, Oct 28}"           | "{Area}. This draft moved it to {Mon, Oct 26}."                                         |
| Move back | "Move {Name} back to {Shift}"                           | "{Area}, {date}. This draft changed it to {Other}."                                     |
| Restore   | "Restore {Name}'s {Shift}"                              | "{Area}, {date}. Removed in this draft with no absence or request recorded."            |
| Assign    | "Schedule {Name} for {Shift} on {date}"                 | "{Area}. Qualified and free that day." (+ " Also works {Other} that day." when they do) |
| Approve   | "Approve {Name}'s pickup request"                       | "{Area} {Shift}, {date}. Takes effect for staff right away, without a publish."         |
| Pattern   | "{Area} {Shift} is short every {Friday} in this period" | "Nobody qualified is free on those days. A repeating shift would stop it recurring."    |

- **Effect line**, from the measured totals: "Closes {n} gap(s)", or, when
  it closes none, "Still short {k} on {date} after this"; then ", and clears
  {m} over" when it does.
- **Not suggested**, one line per person:

| Reason                      | Line                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| All-day absence             | "{Name}: {Sick} that day"                                                   |
| Rest-of-day absence         | "{Name}: {Sick} for the rest of the day"                                    |
| Overlaps work that day      | "{Name}: works {Shift} that day, which overlaps"                            |
| Overlaps the day before     | "{Name}: works {Shift} on {Thu, Oct 22}, which runs into this shift"        |
| Overlaps the day after      | "{Name}: works {Shift} on {Sat, Oct 24}, which starts before this one ends" |
| Neighbouring day not loaded | "{Name}: {Wed, Oct 21} isn't loaded, so it couldn't be checked"             |
| Pickup requester busy       | "{Name}'s pickup request: {the reason above, without the name}"             |

## Data / contracts

All in `@dubgrid/schedule-core`. **Load-bearing (47d).**

- `CoverageSuggestionDay` `{ assignmentIds: number[];
mentoredAssignmentIds: number[]; absenceTypeId: number | null;
restOfDayAbsenceTypeId: number | null }`: one person's day on one side.
  It satisfies 47b's `CoverageDaySide`.
- `CoverageDayOverride` `{ employeeId; dateKey; side: "draft" |
"published"; day: CoverageSuggestionDay }`: what applying writes.
- `CoverageAvailability`, against the draft: `{ kind: "free" }`,
  `{ kind: "absence"; absenceTypeId }`, `{ kind: "restOfDayAbsence";
absenceTypeId }`, `{ kind: "overlap"; dateKey; assignmentId }`,
  `{ kind: "unverified"; dateKey }`. 47d builds it from the staffing
  dialog's helpers.
- `CoverageSuggestionSubject` `{ rowKey; focusAreaId; assignmentId;
dateKey; otherDateKey: string | null; otherAssignmentIds: number[] }`:
  what a suggestion is about, for its words (added while building).
- `CoverageMatrixCell.eligibleAssignmentDefinitionIds` (added to 47a's
  cell while building): who counts toward the cell, so the engine never
  suggests someone already counted.
- `CoverageCellEffect` `{ rowKey; dateKey; past; draftBefore; draftAfter;
publishedBefore: CoverageStatus | null; publishedAfter: CoverageStatus |
null }`.
- `CoverageSuggestion` `{ id; kind: "moveBack" | "restore" | "assign" |
"approvePickup" | "pattern"; employeeId: string | null; requestId: string
| null; final: boolean; targets: { rowKey; dateKey }[]; overrides:
CoverageDayOverride[]; effects: CoverageCellEffect[]; closes; filled;
clearsOver }`. `final` is true only for an approval, which publishes.
- `CoverageRuledOut` `{ rowKey; dateKey; employeeId; requestId: string |
null; reason: CoverageAvailability }`.
- `suggestCoverageFixes(input): { suggestions; ruledOut }`, where `input`
  carries the 47a matrix (built with contributors), the base coverage
  input, the mentored credit, the draft and published day lookups, the
  loaded date keys, the people (`{ id, active, focusAreaIds }`),
  `qualifiedFor(employeeId, assignmentId)`, `availability(employeeId,
dateKey, assignmentId)`, `hasRequest(employeeId, dateKey)`, and the
  pending pickups (`{ requestId, employeeId, dateKey, focusAreaId,
assignmentIds }`).
- No schema, API or migration change.

## Testing

- Unit (Vitest) for every step in schedule-core, with the real
  `computeCoverageCategorySnapshots` underneath (no mocked coverage math),
  plus the step 6 timing test.
- No browser step: there is no UI. 47d qualifies the engine on the real
  grid.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:mobile`
  (schedule-core), `npm run test:web` (the page imports schedule-core),
  `npm run build`.

## Notes for the AI

- Never recount coverage by hand: every effect comes from
  `computeCoverageCategorySnapshots` on the changed days, compared with the
  matrix's own cells.
- A suggestion is kept only when it closes or fills a gap and opens and
  worsens none; anything else is dropped. This is the "never misleading"
  rule (owner, 2026-10-21).
- Started cells are never targets and never written; a change that would
  write a started day is dropped.
- Suggestions are measured one at a time against the current draft, so two
  can clash (the same person suggested for overlapping Day and Day ·
  Supervisor cells). 47d runs the engine again after each apply, so a
  clashing one disappears instead of being applied twice.
- `hasRequest` means a pending request (pickup, swap, call-off or time off)
  where the person is the requester or the target on that date: a shift
  removed while such a request waits is not restored, since the removal may
  be the request's own outcome.
- A pattern's "Nobody qualified is free" is exact by construction: any free,
  qualified person would have produced an assign suggestion for that cell,
  and adding a person can never lower coverage, so assigns are never
  dropped by the keep rule.
- A person whose own draft change is being undone, or whose pickup is
  being approved, for a cell is not also suggested as an assign there
  (found while building: the two had the same effect).
- Approvals publish directly and replace the requester's draft of that day
  (owner, 2026-10-21): their overrides set both sides to the published day
  plus the picked-up assignment.
- Names come from org data; copy says "absence"; no em dashes; credit to two
  decimals.
