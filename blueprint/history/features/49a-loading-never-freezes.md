# Feature: Loading that never freezes

**From build-plan:** feature 49a (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49a-responsive-build` (cut from `dev` at 61717dc3)

## Goal

Planning a build and applying it never freeze the page. While a build is
being worked out the section says what it is doing ("Loading recurring
schedules", then "Placing shifts: 12 so far") with a spinner that keeps
moving; while it is applied it shows "Saving changes: 12 of 46" with a bar,
and the report appears only once every change is saved.

## Decisions (made for the owner, 2026-10-23)

- **Time slicing, not a worker:** the engine's input carries the page's own
  functions (availability, hours), which a Web Worker cannot receive. The
  planner becomes a step generator; the page runs it in slices of about
  12 ms and yields to the browser between them. The synchronous
  `previewCoverageBuild` stays for tests and Apply all for a day.
- **Progress:** placing counts the fixes chosen so far (the total is not
  known in advance); saving counts settled writes against the total the
  build wrote, from the page's existing per-cell write queue.
- **Failures:** a save that fails is handled by the existing write paths
  (their toast and refetch); the build still finishes its count and shows
  the report.

## Build steps

- [x] **Step 1 - Engine** - the planner as a generator;
      `previewCoverageBuildAsync(input, options, { pause, onProgress })`
      gives the same preview as `previewCoverageBuild`, awaiting `pause`
      between steps and reporting fixes placed and staff filled out of those
      needed (owner, 2026-10-23: a percentage bar).
      _Done when:_ tests show equal results, pauses taken, and progress.
- [x] **Step 2 - Page and panel** - the build plans through the async
      planner with a time-sliced pause; the section shows the phase and
      count while generating, and while applying a bar of saved changes
      until every write settles, then the report.
      _Done when:_ panel tests cover each progress state; in the browser
      the spinner keeps turning through a two-week build (frames observed
      during planning) and the report waits for the saves.
- [x] **Step 3 - Docs** - the guide mentions the progress.
      _Done when:_ `docs:check:closed` passes.

## Out of scope

- Renaming (49b), new rules (49c to 49e).

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check and any build is
  undone.

## Outcome (2026-10-23)

- **Engine:** `planSteps` is a generator; `planWithLeftovers` runs it to the
  end, `previewCoverageBuildAsync` awaits the caller's pause between fixes
  and reports `{ placed, filled, needed }`. `needed` is the staff short in
  scope once recurring fills are in, so the percentage is the share of open
  spots filled and jumps to 100 when planning ends with gaps nobody can fill.
- **Page:** `createTimeSlicer(12)` (`apps/web/src/lib/time-slice.ts`) yields
  a task once a slice has run 12 ms. Generate shows "Loading recurring
  schedules and recent weeks", then "Placing shifts: N placed" with a bar
  and percentage. Apply keeps its own `applying` state (its writes make the
  preview stale): "Checking the plan against the latest schedule" with the
  planning percentage, then "Saving changes: N of M" counted from the page's
  per-cell write queue, and the report only when every write has settled.
  `applyCoveragePlan` now returns the writes it made.
- **Bug fixed on the way:** a preview stayed on screen after moving to
  another period whose counts matched, because the staleness key had no
  dates or rows. The key now carries both.
- **Evidence:** schedule-core 268 tests (async preview equals the sync one,
  pauses per fix, progress rises to everything needed, nothing to place
  pauses never); web 273 (panel progress states, `planningPercent`, the time
  slicer with fake timers); type-check and lint clean; `docs:check:closed`
  34 verified. Browser, Calm Haven, Nov 1 to 14 with a temporary
  requirement (removed): Generate planned 56 changes in 0.76 s with no task
  over 50 ms, showing 0% then 5%, 34%, 82%; Build showed checking 0 to 59%,
  then saving 1 to 56 of 56, then the report; one 225 ms task remained, the
  single render of all 56 written cells. Undo left 16 draft snapshots, as
  before. The local stack was restarted after a machine reboot (no reset).
