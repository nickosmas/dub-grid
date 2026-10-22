# Feature: Suggestions in the panel

**From build-plan:** feature 47d (parent 47, Staffing check)
**Status:** verified
**Branch:** `feature/47d-suggestions-panel` (cut from `dev` at 60ed82fe)

## Goal

Coverage Check shows 47c's suggestions and lets a manager act on them: a
ranked list at the top of the panel (top 3, show all), Ways to fix and Not
suggested in each cell's detail, one click to apply a draft fix with an
Undo, an approval behind a confirmation, and the gaps a publish opens and
closes in the Publish dialog. Everything shown comes from the engine's
measured effects, so it never claims more than it does (owner, 2026-10-21).

## Design reference

- The "Staffing check panel" canvas,
  https://claude.ai/artifact/KSPPPawq4W1E89ZUJNdmAT: Suggestions (icon,
  title, effect, action button), "Show all", Applied with Undo, Ways to fix
  and Not suggested in the cell detail, and the approval confirmation
  ("Approve {Name}'s pickup request?", "... right away. Staff see it
  without a publish, and it can't be undone here.").
- Decisions the canvas left open, made here (owner asked for the logical
  call, 2026-10-22):
  - Move back, Restore and Schedule change only the draft, so they apply at
    once and offer Undo, as the canvas shows; Approve publishes, so it asks
    first (owner: every important action confirms; the canvas confirms
    only the approval).
  - A suggestion is applied through the same save path as any edit
    (`setShift`), and a schedule suggestion through Fill a spot's own
    builder, so it can never write something the editor could not.
  - Undo writes each touched cell back exactly as it was. A cell that had
    no draft goes back to its published state, which the grid treats as no
    draft.

## In scope

- A web adapter that feeds `suggestCoverageFixes` the page's real data.
- The suggestion list, the cell detail sections, apply, undo and approve.
- The Publish dialog's opened and closed counts for its window.
- The public guide.

## Out of scope

- Suggestions on mobile, the dashboard or reports.
- Undo after leaving the page (the Applied list lives with the panel).
- Grouping one person's suggestions across days.

## Build steps

- [x] **Step 1 - The adapter** - `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts`
      builds the engine input from the page's data: days from `shifts`
      (draft from the effective cell, empty when deleted; published from
      the published fields; mentored and rest-of-day absences included),
      people from employees, `qualifiedFor` from
      `isEmployeeQualifiedForAssignmentDefinition`, `availability` from the
      staffing dialog's own helpers (rest-of-day absence, whole-day absence,
      overlap that day, overlap with the day before or after, a neighbouring
      day not loaded), `hasRequest` and the pending pickups from the request
      list with the same filter as the open-shifts row.
      _Done when:_ unit tests show each availability result, a deleted
      draft read as empty, mentoring carried, a pickup that counts and ones
      that do not (claimed by someone, a swap, another date), and a pending
      call-off counted as a request.
- [x] **Step 2 - The list** - the panel (editors only, not in Month) shows
      Suggestions above the matrix: the top 3 with "Show all {n}", each with
      its title, effect and an action (Move back, Restore, Schedule,
      Approve; none for a repeating gap). Choosing a suggestion's text
      selects its first cell. With no suggestions and no gaps it shows
      nothing; with gaps and no suggestions, "No fixes found. Each short
      day's detail says why."
      _Done when:_ component tests cover the top 3 and show all, each
      action label, a pattern without an action, selecting a cell from a
      suggestion, the empty line, and nothing for a non-editor.
- [x] **Step 3 - The cell detail** - Ways to fix (the suggestions that
      target the cell, with their actions) and Not suggested (the engine's
      reasons for that cell) under What changed.
      _Done when:_ component tests show both sections for a short cell,
      neither for a staffed one, and the reasons in order.
- [x] **Step 4 - Apply, undo and approve** - applying writes each override
      through `setShift` (move back and restore: the cell's published
      state; schedule: Fill a spot's builder for that person), records the
      touched cells as they were, and adds the suggestion to an Applied list
      with Undo; Undo writes them back. Approve opens a confirmation (which also says "Their draft change for that day is replaced." when the requester has one, since an approval replaces it), then
      resolves the request through the existing approval; Applied shows it
      as Published, with no Undo. A suggestion that can no longer apply (the
      person is no longer free) says so in a toast and changes nothing.
      _Done when:_ tests cover the inputs each kind writes, Undo restoring
      a cell with a draft and one without, the confirmation, and the stale
      case; browser evidence in step 7.
- [x] **Step 5 - The Publish dialog** - Publish Schedule? adds "This
      publish opens {n} gaps and closes {m}." (or "This publish doesn't
      open or close any gap.", ending "on dates already published" when
      only some are) from the draft and published coverage of its
      window, counting cells that have not started.
      _Done when:_ `PublishChangeSummary` tests cover opened, closed, both,
      none and no coverage requirements.
- [x] **Step 6 - Public guide** - the Coverage Check section describes
      suggestions, Ways to fix, Not suggested, Undo and approval, and the
      Publish dialog line.
      _Done when:_ `npm run docs:check` and `npm run docs:verify` pass with
      the changed pages' fingerprints re-recorded.
- [x] **Step 7 - Browser qualification** - local Calm Haven as
      `qa-super-admin`, light and dark, 2 Weeks at 1440px and phone width,
      with temporary requirements and draft edits, and a temporary pickup
      request made by `qa-regular` (all removed afterwards).
      _Done when:_ each kind applies and its cell changes by exactly the
      effect shown, Undo puts every touched cell back, the approval asks
      first and then shows for staff without a publish, a non-editor sees
      no suggestions, the Publish dialog's counts match the panel's
      comparison line, and opening the panel stays under 300 ms in
      development mode.

## Qualification evidence (2026-10-22)

Local Calm Haven as `qa-super-admin`, 2 Weeks at 1440px and 375px, dark
(light shares the 47a tokens), with six temporary requirements, two
temporary draft edits and three pickups made by `qa-regular`; all removed
afterwards (requirements deleted, drafts discarded, the two approved
pickups' shifts taken back off with one publish, the third pickup closed).

| Check                    | Result                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Opening the panel        | 134 ms in development mode with 209 suggestions                                                                    |
| Move back                | Fri 23 Supervisor 0/1 to 1/1, Sat 24 2/1 to 1/1, as "Closes 1 gap, and clears 1 over" said; Undo put both back     |
| Restore                  | Tue 27 Day 3/5 to 4/5, as "Still short 1 after this" said; Undo put it back                                        |
| Schedule                 | Thu 22 Evening 4/5 to 5/5 ("Closes 1 gap"), Barbara Trent's Day Shift kept (D/E); Undo put it back                 |
| Approve                  | Confirmation worded as specced; Mon 26 Evening 3/5 to 4/5 and the grid at once; the request approved and published |
| Pickup on an absence day | Not suggested; the cell says "QA Regular's pickup request: Off that day"                                           |
| Publish dialog           | "This publish opens 1 gap and closes none.", matching the panel's comparison line                                  |
| Phone width              | Titles wrap beside the action, no overlap, no horizontal scroll                                                    |
| Someone who cannot edit  | Covered by the component test and the page computing suggestions only for editors; not repeated in the browser     |

Found and fixed during the run:

- An approval made from a suggestion left the grid and panel stale until a
  reload (approvals do not send the publish broadcast); the page now reloads
  schedule data after a successful approval.
- Suggestion titles did not wrap at phone width and ran under the action
  button; the row now wraps.

## Data / contracts

- The adapter returns `CoverageSuggestionInput` (47c) plus the text
  lookups (`CoverageSuggestionTextLookups`); nothing new is stored.
- Applied entries live in panel state: `{ suggestionId, title, kind,
before: { employeeId; dateKey; input: ScheduleCellInput | null }[] }`.
- No schema, API or migration change.

## Testing

- Unit: the adapter; components with mocked suggestions; the Publish
  dialog line.
- Browser: step 7.
- Gates: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run build`, docs checks.

## Notes for the AI

- The engine runs only while the panel is open (or the Publish dialog
  is), like the matrix.
- Seeded Calm Haven requests are permanent: never approve one; make a new
  pickup as `qa-regular` for the browser check.
- Copy: no em dashes; "absence"; buttons never wrap.
