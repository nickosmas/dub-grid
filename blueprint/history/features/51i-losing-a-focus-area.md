# Feature: Losing a focus area

**From build-plan:** feature 51i (item 51, Staff statuses)
**Status:** verified

## Goal

A manager takes Barbara Trent off East Wing while she still has shifts there
from today on. Before the save goes through they're asked: "Clear Barbara
Trent's upcoming shifts in East Wing?", with how many there are and their
dates. **Clear shifts** saves the change and takes those shifts off in the
draft, so they leave the schedule when it's published, and closes the open
requests on them. **Keep shifts** saves the change and leaves the shifts where
they are. Cancel goes back to the form. Nobody is asked when the focus areas
they come off hold no upcoming shifts for them.

Today nothing acts on those shifts: the person comes off the focus area and
their shifts there stay, unannounced.

## Design reference

No new board. The question is the shared confirmation (`ConfirmDialog` on
web, `ConfirmationModal` on mobile), in the shape of "Replace existing
shifts?" in the repeat form: a confirm, a second confirm and a way back.

## Decisions made (owner delegated, 2026-10-28)

- **A shift "in" a focus area:** a day whose current schedule (the draft, or
  the published schedule when there's no draft) is worked, with a shift that
  belongs to that focus area; when none of its shifts belongs to any focus
  area (a job without a shift, a shift shared by every focus area), the day's
  own recorded focus area decides. Reason: shifts carry the focus area and
  the grid places a person's shifts by it, while a web save doesn't record
  the day's own focus area.
- **Upcoming:** from today in the organization's timezone, as 51f and 51g
  clear from today.
- **Absences aren't shifts:** a day holding only an absence is never counted
  or cleared. A day with an absence beside the shift is cleared whole.
- **What clearing does to a day:** as 51f and 51g clear a day: a day never
  published is deleted, a published one is set to removed in the draft. A day
  whose draft put the shift over a published state that isn't a shift there
  goes back to what was published. A day with shifts in two focus areas is
  cleared whole (rare; the day is the unit the draft writes).
- **One question per save:** every focus area being removed that holds
  upcoming shifts is listed in one question, and one answer covers them all.
- **The server asks:** a save that removes a focus area with upcoming shifts,
  and doesn't say what to do with them, is refused with
  `FOCUS_AREA_SHIFTS_DECISION` and the counts; web and mobile ask and send the
  save again with `clear` or `keep`. Reason: every path that edits focus areas
  (the People panel, the person page, the mobile person and profile forms)
  then asks, and the counts come from the same database function the clear
  runs with.
- **Order, not one transaction:** the person is saved first (version
  checked), then one database call clears every shift in a single
  transaction. If the clear fails the save stands, nothing is half cleared,
  the shifts are kept, and the manager is told "Saved, but their shifts in East
  Wing weren't cleared. Remove them on the schedule." Reason: it reuses both
  save paths unchanged (the web update and the mobile audit RPC) instead of a
  third write path for the whole person.
- **Requests closed:** open or waiting requests the person made for a cleared
  day, and swaps where a cleared day is the shift they'd give, expire as 51g's
  clear expires them. A pickup they claimed is left: it isn't one of their
  shifts, and approval checks who can take it.
- **Keep:** no grid flag. A shift in a focus area someone isn't in already
  shows them as a guest row in that section (a floating shift), and coverage
  counts people by their focus areas, so kept shifts read as cover from
  outside.
- **Terminology:** the question names the focus areas themselves ("in East
  Wing", "in East Wing and West Wing") and never the generic term, so no
  default English label is needed.
- **Activity log:** clearing writes its own row,
  `employee.focus_area_shifts_cleared`: "Cleared 3 upcoming shifts for Barbara
  Trent in East Wing".
- **Mobile:** both forms that edit focus areas ask: the person page's edit
  sheet and a manager's own Work details. The confirmation gains a second
  action, shown in place of its plain Cancel (closing it is the way back).
- **The open form is kept:** a save that removes a focus area isn't shown
  ahead of the answer (the People list row and the person page wait), so
  Cancel leaves the form as it was edited rather than resetting it.
- **Buttons:** Cancel, Keep shifts (drawn like Cancel, a new
  `secondaryConfirmTone="neutral"` on `ConfirmDialog`) and Clear shifts in
  the warning colour, as the repeat form's "Replace existing shifts?".
  Mobile has no Cancel button: Keep shifts and Clear shifts, closed from
  the corner or the backdrop.
- **Your own record:** a manager taking themselves off a focus area in the
  app's Work details reads "Clear your upcoming shifts in East Wing?" and
  "You have ...".
- **Order in the log:** the clear's row is written after the edit's
  `employee.updated` row, so the activity log reads edit, then clear.
- **Not covered:** archiving a focus area in Settings is already refused
  while anyone is in it; approving a legacy staff request that changes focus
  areas (no screen submits one now) keeps the shifts; adding focus areas and
  import never remove one.
- **Copy:**
  - title: "Clear Barbara Trent's upcoming shifts in East Wing?" (one focus
    area) or "Clear Barbara Trent's upcoming shifts?" (several);
  - message: "They have 3 upcoming shifts in East Wing, Tue, Nov 3 to Fri,
    Nov 20." / "1 upcoming shift in East Wing, on Tue, Nov 3." / several:
    "They have 3 upcoming shifts in East Wing and 1 in West Wing, Tue, Nov 3
    to Fri, Nov 20.";
  - points: "Cleared shifts come off in the draft and leave the schedule when
    it's published." and "Open requests for those shifts are closed.";
  - buttons **Clear shifts**, **Keep shifts**, Cancel;
  - a save refused for want of an answer (any other caller): "Choose whether
    to clear or keep their 3 upcoming shifts in East Wing."

## Build steps

- [x] **Step 1 - Shared rules and copy.** `@dubgrid/domain`
      `focus-area-shifts.ts`: the code, the area summary type,
      `removedFocusAreaIds`, `describeFocusAreaShiftsQuestion`,
      `focusAreaShiftsRefusal`, `parseFocusAreaShiftsQuestion`. _Done when:_
      domain tests cover one area, one shift, several areas and parsing.
- [x] **Step 2 - Migration 107.** `upcoming_focus_area_shifts` (counts and
      date range per focus area) and `clear_focus_area_shifts` (the clear and
      the requests), service role only. _Done when:_ `db:migrations:check`
      passes and a live test covers each rule above.
- [x] **Step 3 - Server.** Both update routes take `focusAreaShifts`, refuse
      without it when needed, clear after the save and write the audit row;
      the audit registry reads it. _Done when:_ route tests on both.
- [x] **Step 4 - Web.** `updateEmployee` asks through a callback and sends the
      save again; `useFocusAreaShiftsQuestion` renders the dialog; the People
      panel and the person page ask. _Done when:_ client and hook tests and
      screenshots.
- [x] **Step 5 - Mobile.** The confirmation's second action; the person edit
      sheet and Work details ask. _Done when:_ screen tests.
- [x] **Step 6 - Docs.** The roster guide says what happens. _Done when:_
      `npm run docs:check` passes.

## Out of scope

- 51j and 51k.
- Clearing only some of the removed focus areas' shifts.
- Restoring shifts after a focus area is given back.

## Testing

- Live integration test for 107 (BEGIN/ROLLBACK).
- Domain, route, client, hook and screen tests; screenshots.
- Gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- `clear_schedule_for_planned_away` (103) is the model for the clear; this one
  filters by focus area and reads the current state rather than the date
  range alone.

## Completion evidence

- Gate in the worktree: `npm run build:packages`, `npm run type-check`,
  `npm run lint` (the two old `<img>` warnings, none new),
  `npm run test:mobile` (mobile 178 files, 1,565 tests, and every package:
  domain 265), `npm run test:web` (715 files, 6,768 tests, first run),
  `npm run docs:check`, `npm run docs:links`, `npm run db:migrations:check`.
- Migration 107 integration test (5) on the local stack; 107 applied to the
  local database only, not production.
- New tests: domain `focus-area-shifts.test.ts`; the server helper (plan and
  clear); both routes (refusal before any write and before a login email
  change, the answer passed on, clear after the save, a failed clear still
  200 with `focusAreaShiftsNotCleared`, an unknown answer refused); the web
  client (ask then resend, close saves nothing, refusal text without an
  asker, failed clear passed on); the web hook (copy, each button);
  `useEmployees` (asks through the caller's options, quiet on close); the
  audit headline; mobile `ConfirmationModal`'s second action, the mobile
  hook, the person edit (Keep shifts resends, close keeps the form) and Work
  details (your own record, Clear shifts resends).
- Browser, Calm Haven as the QA Super Admin (worktree dev server on 3001, a
  throwaway "Focustest Fixture" in Skilled Nursing and Sheltered Care with
  three published and one draft Day shift in Skilled Nursing from Mon,
  Nov 2 and one Sheltered Care shift on Nov 6; deleted afterwards with its
  audit rows): taking them off Skilled Nursing on the person page asked
  "Clear Focustest Fixture's upcoming shifts in Skilled Nursing?" / "They
  have 4 upcoming shifts in Skilled Nursing, Mon, Nov 2 to Thu, Nov 5.";
  Clear shifts removed the three published days in the draft, deleted the
  draft-only day, left Nov 6, and the Activity tab read "Updated Focustest
  Fixture's details" then "Cleared 4 upcoming shifts for Focustest Fixture
  in Skilled Nursing"; Keep shifts left every day and wrote no clear row,
  and the grid showed the kept shifts as a guest row under Skilled Nursing;
  Cancel saved nothing and kept the edited form with Discard and Save (the
  first run reset the form, fixed by not showing such a save ahead of the
  answer). Screenshots:
  `/private/tmp/claude-501/-Users-nickosmas-Dev-dub-grid/f10f6916-4f01-45ef-9fc0-fd498f7e0feb/scratchpad/shots/51i/`.
- Not verified in the browser: the People list's side panel (a row click
  opened the person page; `useEmployees` tests cover its path) and a failed
  clear. Not taken: a simulator screenshot of the mobile question; its screen
  tests cover it.
