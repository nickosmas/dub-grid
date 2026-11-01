# Feature: Native iOS and Android - Native sheets and dialogs

**From build-plan:** feature 56e
**Status:** complete
**Completed:** 2026-10-31
**Branch:** `feature/56e-native-sheets`

## Goal

Every bottom sheet and popup uses the platform's own element (owner,
2026-10-31: "sheets, popups etc should all use native elements"):

- **Sheets** are `@expo/ui`'s community bottom sheet: SwiftUI's sheet on iOS
  (the system grabber, swipe down or the scrim to close, Liquid Glass on
  iOS 26) and Material 3's ModalBottomSheet on Android. Every sheet is only as
  tall as its content (owner, 2026-10-31); a long one scrolls within a capped
  body, and while the keyboard is up the body shrinks so the title, the
  focused field and the actions stay above it. Its header follows each platform (owner, 2026-10-31: "make sure
  sheet headers design is native", citing the HIG Sheets page and Material 3's
  bottom sheets): on iOS a bar under the grabber with the close button as a
  glass circle on the leading edge and the title centered at 17 points; on
  Android the title left-aligned under the drag handle with no close button,
  since a swipe, the scrim and Back close the sheet.
- **Confirmations** that are only words are the system alert (UIKit's alert,
  Material's AlertDialog), with Cancel, an optional second action and the
  confirm action (destructive style for a danger confirmation), keeping each
  confirmation's title, body and summary lines. A failure comes back as an
  alert of its own with Try again. A confirmation that carries controls of its
  own (a choice to make before confirming) is a native sheet.
- **The app lock** (a gate, or any sheet asking for a cover backdrop) keeps
  the drawn sheet, whose opaque cover a native sheet can't give.
- **Actions at the top** (owner, 2026-10-31: "get rid of all bottom buttons in
  all edit surfaces in favor of top liquid glass approach"): a sheet's Cancel
  and primary action leave its footer for its bar, the close button on the
  leading edge and the action as a tinted glass capsule on the trailing one
  (a text button on Android), labelled with its verb ("Add", "Save"); a second
  action such as Clear all takes the leading slot. Profile details, the
  person editor and the password screen put Save (or Update) in the
  navigation bar, filled, and Discard in place of the back button while there
  are changes. A long scrolled sheet fades out above the home indicator.
- **People rows** mark an Admin or Super Admin with the star alone (blue or
  gold, named for screen readers), not a labeled pill, leaving the row's room
  for their status (owner, 2026-10-31).
- **Sections** open from their title, as each platform draws it (owner,
  2026-10-31): iOS follows the title with a chevron, Android puts an arrow at
  the row's trailing edge (`SectionHeading`), in place of "See all".
- **Section tags** (the Schedule focus areas, the Requests and Alerts tabs)
  are Liquid Glass capsules on iOS 26, gray-tinted at rest and brand-tinted
  while selected, and Material 3 filter chips on Android with a check mark,
  each count in a small blue-tinted circle.
- **Lists and cards** are the platforms' grouped lists (owner: surfaces "fully
  native"): the page is iOS's grouped gray (#F2F2F7, black in dark mode under
  #1C1C1E cards), cards are flat and separate by fill with no shadow or
  border, rows are 52 points with separators inset to the text, row icons are
  bare glyphs, section headers are small uppercase gray on iOS and small brand
  titles on Android, a chosen row carries a bare checkmark on iOS and a radio
  button or checkbox on Android with no filled row, and text fields are
  borderless with a hairline on iOS and outlined on Android. A native sheet
  takes the grouped gray, its groups white with no outline.
- The web and the tests keep the drawn components: the native versions live in
  `.native.tsx` files, and Vitest resolves the base file.

## Build steps

- [x] **1. Drawn sheet kept** - `BottomSheetModal.tsx` renamed
      `BottomSheetModalDrawn.tsx`; `BottomSheetModal.tsx` re-exports it.
- [x] **2. Native sheet** - `BottomSheetModal.native.tsx`: the header row with
      a close button, a fitted or full-height body, the sticky footer, and the
      content pinned to the screen width so text in a row wraps (the app is
      phone-only; a fitted sheet otherwise lays out without a set width). The
      native sheet reports every dismissal, including one the caller made by
      hiding it, so `onDismiss` runs only for a dismissal while the sheet
      should be showing (a sheet that asks to discard input would otherwise
      ask again after saving).
- [x] **3. System alert** - `ConfirmationModal.native.tsx`: the alert for a
      words-only confirmation, a native sheet for one with children.
- [x] **4. Evidence** - iOS Simulator (Android below).

## Progress notes

- iOS Simulator (iOS 26.5): People's filter sheet and Profile's Display mode
  are fitted SwiftUI sheets with the grabber, close by swipe, scrim and the
  close button, and open again after a swipe; Add person's kind choice wraps
  its descriptions; the Add person form fits its content and, with the
  keyboard up, keeps its title, the field and its Cancel and Add person
  buttons above the keyboard; Sign out is the iOS 26 system alert with a red Sign out.
- Android emulator: not verified. The Pixel 10 Pro XL emulator froze (adb
  stopped answering) three times this session soon after the app launched,
  before a sheet could be opened. The Android path is `@expo/ui`'s Material 3
  ModalBottomSheet with no DubGrid-specific layout beyond the iOS one; check
  it on the next Android device run (56d).
- Checks: mobile type-check, lint on the changed files, `npx vitest run` in
  `apps/mobile` (177 files, 1537 tests), `npm run docs:check`.
- Docs: no page names the sheet or alert chrome, so no copy changed.
