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
  iOS 26) and Material 3's ModalBottomSheet on Android. A sheet that fits its
  content is sized to it; a sheet that scrolls opens at full height, like a
  system form sheet, so the keyboard never pushes its title and actions off
  the screen. Its header follows each platform (owner, 2026-10-31: "make sure
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
- **People rows** mark an Admin or Super Admin with the star alone (blue or
  gold, named for screen readers), not a labeled pill, leaving the row's room
  for their status (owner, 2026-10-31).
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
  its descriptions; the Add person form opens at full height and, with the
  keyboard up, keeps its title in place and its Cancel and Add person buttons
  above the keyboard; Sign out is the iOS 26 system alert with a red Sign out.
- Android emulator: not verified. The Pixel 10 Pro XL emulator froze (adb
  stopped answering) three times this session soon after the app launched,
  before a sheet could be opened. The Android path is `@expo/ui`'s Material 3
  ModalBottomSheet with no DubGrid-specific layout beyond the iOS one; check
  it on the next Android device run (56d).
- Checks: mobile type-check, lint on the changed files, `npx vitest run` in
  `apps/mobile` (177 files, 1537 tests), `npm run docs:check`.
- Docs: no page names the sheet or alert chrome, so no copy changed.
