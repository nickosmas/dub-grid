# Fix: Long sheets fill the screen, icon bar actions, and discards asked from the X

**Type:** Fix
**Status:** complete
**Completed:** 2026-10-31
**Branch:** `fix/sheet-resize-icon-actions`

## The problem

Owner requests, 2026-10-31:

- A sheet with long content should drag up to fill the screen.
- Cancel and confirm in a bar should be an X and a checkmark rather than
  words, except where the words matter (Send, Clear all and the like).
- A discard should be asked from the X itself, as iOS 26 does in Contacts,
  not in an alert in the middle of the screen.

Found while doing it:

- On Android the editors' top-bar Save never drew: Android's toolbar shows
  only icon buttons, and it had a label.
- Leaving an editor left its screen without a back button, because the hidden
  back button was never restored.

## The fix

- **Sheet height (iOS).** A sheet that scrolls is sized by detents. It opens at
  its content's height, or at most 70% of the screen, and a longer one drags up
  to full screen. Content that grows or shrinks while the sheet is open moves
  the detent. A short sheet stays as tall as its content, without the home
  indicator's inset counted twice.
- **Sheet height (Android).** A long sheet opens part way and expands, which
  is decided when it opens.
- **Bar actions.** `barActionIsCheckmark` (`shared/lib/bar-action.ts`) draws a
  commit that only saves (Save, Save changes, Save access, Done, Update,
  Confirm, Apply, OK) as a checkmark in the brand glass circle, opposite the
  X. Everything else keeps its words: Send, Add, Submit, Continue, Approve,
  Reject, Finish, Mark away and the other status verbs, Clear all, and
  anything destructive.
- **Editor bar.** The editors' bar uses the same rule. iOS draws the
  checkmark as a white image, since the system tints a symbol on the
  prominent item pale blue. Android draws a checkmark, or an arrow for Send.
- **Requests sheet.** Reject and Cancel request in the approval sheet are red,
  as their alert is, and its Dismiss is the X.
- **Discard from a sheet's X.** A destructive question inside an iOS sheet
  whose bar has an X opens from that X as SwiftUI's confirmation dialog
  (`AnchoredConfirmation`). That covers every unsaved-changes guard on a
  sheet.
- **Discard from an editor's X.** The X opens a native menu titled "Discard
  unsaved changes?" with a red Discard. Editors used to discard without
  asking.
- **Back button.** `EditBarActions` gives the back button back when the
  editor closes.

## Verify

- **iOS Simulator:**
  - People's filter sheet opens at 70% and drags to full screen, and its list
    scrolls to the end.
  - Change status fits its content and grows with the Away form.
  - Its X with a choice made opens the anchored dialog: Discard closes the
    sheet, and a tap outside keeps it.
  - The person editor shows the X and a gray, then blue, checkmark. Its X
    with changes opens the discard menu, Discard resets the form, and the
    back button returns after leaving edit.
- **Checks:** the mobile suite (1,538 tests), type-check, lint and
  `docs:check`.
- **Android:** not run on a device or emulator.
