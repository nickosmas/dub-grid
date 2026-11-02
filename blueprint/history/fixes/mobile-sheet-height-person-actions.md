# Fix: Sheets show all their content, and the person page reads like Profile

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-sheet-height-person-actions`

## The problem

- On iOS 26 a short sheet that scrolls (Filter by wings on Coverage) opened
  too short and cut off its last rows. The height maths took off the home
  indicator's inset twice, because before iOS 26 the system added it below
  the sheet. iOS 26's floating sheet adds nothing.
- A long sheet opened at 70% of the screen and had to be dragged up to see
  the rest. The owner wants every sheet to open showing all of its content
  (2026-11-02).
- On a staff member's page, an empty Email or Phone was a text box to type
  into, beside filled rows with an icon. The rest of the page changes only
  in Edit.
- The page's end actions (Add to an administrative team, Add to schedule,
  Revoke invite) were left-aligned list rows. Profile's Switch organization
  and Sign out are full-width buttons, so the two pages clashed.

## The fix

- `BottomSheetModal` (native) takes off one inset on iOS 26 and two on older
  iOS. A sheet that scrolls opens at its content's height. Only content
  taller than the screen opens it full height to scroll; on Android that is
  the only case that isn't sized to its content.
- Contact shows only what's on file. An empty field is the same row as a
  filled one, with "Add email" or "Add phone" in the tint and a chevron. It
  opens Edit with the keyboard on that field (`ProfileInfoRow` takes an
  `onPress`). The inline entry field and its one-field save are gone.
- `ProfileActionGroup` always draws full-width buttons, as Profile does.
- Home and Schedule could open with their content under the header on a slow
  first load (seen once on the simulator, shifted by exactly the header's
  176pt). The one settle scroll ran before the header inset landed and was
  clamped to 0. Until the page is touched, `Screen` now settles again 150ms
  and 500ms later, when the content size changes, and when a scroll leaves
  the top. Only these two screens use the sticky header, and neither moves
  the page by itself.

## Checks

- Mobile type-check, lint, and the tests for `shared/components`, `people`
  and `profile` (500 tests), including a new one: an empty field opens Edit
  with focus on it.
- On the iOS 26.5 Simulator: Coverage's filter sheet shows its whole list,
  People's long filter opens full height, the person page's Contact rows
  match, and the admin team button matches Profile's buttons.
- Not checked: an Android emulator or a physical phone. The header bug did
  not happen again in four cold launches, with or without the change, so the
  fix is not proven against it; logs showed each launch settling at -176.
