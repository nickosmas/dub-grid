# Feature: Suspended, managing it (Change status)

**From build-plan:** feature 51d (item 51, Staff statuses)
**Status:** verified

## Goal

Every status change for a person goes through one **Change status** button
and one dialog, on web and mobile. The dialog says where they stand in a line
under the title, lists only the statuses they can move to, and shows the
fields and notes for the one picked. Suspend joins Mark away, Archive, Mark
active, Reinstate and Restore there. The overflowing status buttons in the
People panel go away.

The rest of 51d (the grid lock, the shift picker note, the notice email, the
Super Admin alert and closing their requests) follows in later steps.

## Design reference

The "One status button" and "Five ways to show the current status" boards on
the "Staff status across surfaces" canvas
(https://claude.ai/artifact/ADYjGDMEaYXJyLKeps4Gzo): option B, the dialog,
with design 1, the status line under the title. Built from the app's own
components, not the canvas styling (owner, 2026-10-27): web choices are
`SeriesScopeChoices`-style radio cards in the primary color, mobile choices
are a `ProfileChoiceGroup` list, and the dialogs are `ConfirmDialog` and the
mobile confirmation sheet. The status line keeps only the status pill's tone
on its dot. Confirmation copy follows the owner's dialog rules.

## Decisions

- One button, **Change status**, replaces Mark away, Archive, Mark active,
  Restore, Set or Change return date and Reinstate wherever they appear (web
  panel and person page, mobile person page). Management access keeps its
  own button.
- The dialog's title is "Change {name}'s status?". At its top, a box tinted
  like the status pill names the current status ("Away until Fri, Oct 30",
  "Suspended since Oct 26") and what it means; the current status is never a
  choice (owner, 2026-10-27).
- Every confirmation dialog, on web and mobile, has an X close button at top
  right (owner, 2026-10-27).
- No caption that repeats the title or the choice: Mark active, Restore,
  Reinstate, Suspend and Archive have no message, and Mark away has one only
  when a return date adds something (owner, 2026-10-27).
- Choices by status: Active offers Away (when on the schedule), Suspended
  and Archived; Suspended offers Active (Reinstate), Away and Archived; Away
  offers Active (Mark active) and Archived; Archived offers Active (Restore).
- Picking a choice shows its fields (Away: return date, absence, reason;
  Suspended and Archived: reason) and its message and notes from
  `describeStatusAction`. The confirm button is that action's label.
- For someone Away, their return date and absence sit under the status line;
  changing them with nothing picked saves as **Save changes** (the old
  Change return date).
- Suspend's copy: "Suspend {name}?", and notes that they're signed out on
  every device and can't sign in, and that their shifts stay and they can
  still be scheduled.

## Build steps

- [x] **Step 1 - Shared choices and copy.** `statusChoices` and
      `describeCurrentStatus` in `@dubgrid/domain`, and `describeStatusAction`
      gains `suspend`. _Done when:_ domain tests cover every status's
      choices, the status line, and Suspend's copy against the dialog rules.
- [x] **Step 2 - Web Change status.** A generic radio-card list extracted
      from `SeriesScopeChoices` (which then uses it); `EmployeeStatusActions`
      renders one Change status button and one `ConfirmDialog` with the
      choices, fields and notes; suspend wired through `onSuspend` to the
      51c route. _Done when:_ component tests for each status and action;
      screenshots of the panel and the dialog.
- [x] **Step 3 - Mobile Change status.** One Change status button and one
      sheet on the person page with the same choices as a list, the fields,
      and the notes. _Done when:_ component tests; a screenshot.

- [x] **Step 4 - Grid lock and picker note.** In the Week and 2 Weeks grid
      a suspended person's name carries a lock ("Suspended: won't see this in
      the app" on hover and to screen readers), and the Assign open shift
      list says the same under their name. They stay schedulable. _Done
      when:_ a picker test; a grid screenshot.
- [x] **Step 5 - Their open requests close (migration 102).** Suspending
      someone expires every open or waiting request they made or are the
      swap partner on, as archiving does, and puts a pickup they claimed back
      up for others. No note names the suspension. _Done when:_ an
      integration test on the local stack covers each kind and leaves other
      people's requests alone.
- [x] **Step 6 - Notice email and Super Admin alert.** Suspending someone
      with an account emails their own address ("Your access to {org} is
      suspended", no actor named), and alerts the organization's other Super
      Admins: "{name} is suspended" / "They can't sign in. Their shifts stay
      on the schedule." Both after the response, from web and mobile, never
      failing the suspension. _Done when:_ email, event and route tests.

## Out of scope

- Bulk status changes (51h).
- Archiving still expires a pickup they claimed rather than reopening it
  (51k, One Archive).

## Testing

- Domain, component and screen tests; screenshots.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run docs:check`.

## Notes for the AI

- No person names in dialog messages or notes; titles may name them.
- Equal-width peers: the panel's footer is Add to Management and Change
  status, side by side.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint`, `npm run docs:check` passed; `npm run test` passed every package and mobile (1530) and web 6561 of 6564, the three failures being the email and service-role inventories that had to list the new email and helper. Both were registered and their 120 tests pass.
- Migration 102 integration test (4) on the local stack; picker, route, event, email and notice tests.
- Browser: the grid's lock and its hint on a suspended Calm Haven person.
- Not seen in a browser: the Assign open shift note (no open shift in the local data); covered by its component test.
