# Feature: Native iOS and Android - Platform consolidation

**From build-plan:** feature 56d (replaces the polish pass; owner, 2026-11-09)
**Status:** complete
**Completed:** 2026-11-09
**Branch:** `feature/56d-platform-consolidation`

## Goal

Follow the industry standard for a cross-platform app: one DubGrid design on
iOS and Android, and native only where iOS, Android or the navigation library
supply it. Controls are written once, so a new screen or control needs no
per-platform work, and the code that ships is the code the tests run.

Today 19 platform files (about 1,800 lines) draw controls once per platform.
13 of them fold into a single shared control. The audit findings F-230 to
F-234 are fixed along the way.

## The rule this feature sets

| Native (the platform supplies it)    | One shared DubGrid control   |
| ------------------------------------ | ---------------------------- |
| Navigation bar, its buttons and back | Segmented switch             |
| Tab bar                              | Toast                        |
| Search field (`Stack.SearchBar`)     | Tab strip (section tags)     |
| System alerts                        | Pick-one and pick-many marks |
| Sheets (`BottomSheetModal.native`)   | Status symbols               |
| iOS date calendar, share, haptics    | Round header button          |

A shared control may use a platform **material** when the platform has one:
Liquid Glass through `isLiquidGlassAvailable()` and Android's ripple through
`android_ripple`. Its shape, size, position, content and behavior are the same
on both phones. Layout never branches on `Platform.OS`.

## Owner decisions (2026-11-09, defaults recommended in this spec)

These reverse rules from 2026-10-31. Each is a default the review can change
before its step is built.

| Control                                       | iOS today                                    | Android today                                    | Both phones after                                           |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Segmented switch (admin Home, People filter)  | UIKit segmented control                      | Material 3 segmented buttons                     | DubGrid's `SegmentedControl`, stretched                     |
| Toast                                         | Glass capsule at the top                     | Snackbar at the bottom                           | Capsule at the top, glass where available                   |
| Tab strip (Alerts, Requests, filters)         | Glass capsules                               | Material filter chips with a check               | Capsules, glass where available, brand when selected        |
| Pick-one mark                                 | Bare brand checkmark                         | Radio button                                     | Bare brand checkmark                                        |
| Pick-many mark                                | Ring that fills with a white check           | Square checkbox                                  | Ring that fills with a white check                          |
| Status symbol (banners, toasts)               | SF Symbol in two colors                      | Material icon                                    | Material icon                                               |
| Search                                        | System field under the large title           | Material docked bar above the list               | System search on both (an app-bar search action on Android) |
| Discard from a sheet's X or Person detail     | SwiftUI popover from the button              | System alert                                     | System alert                                                |
| Round header button                           | Glass circle                                 | Tonal circle with ripple                         | Unchanged look, one file                                    |
| Text field                                    | Rounded, borderless; Profile as grouped rows | Material outlined field, 4dp corners             | iOS's form                                                  |
| Section and group titles, full-page sheet bar | 17pt header; centred title                   | Brand-colored header; Material title at the left | iOS's form                                                  |

Kept as they are: the drawn controls listed under "Kept as drawn" in the
native UI rules, Android's brand colors, sheet sizing, bar actions.

## In scope

- One tab list for every tab layout, and the tab error screen on Android
  (F-230).
- A test that every platform file exports what its base exports.
- `HeaderBarAction`, a shared bar button (F-232).
- Folding the nine controls in the decisions table into one file each.
- One text field and one list form on both phones, retiring `IS_IOS_LIST`
  and `IS_ANDROID_LIST`, which hid platform branches from the audit and
  the lint rule.
- Search through `Stack.SearchBar` on both phones, with the route option in
  `ScreenSearch` (F-233).
- Tests for the platform files that remain (F-231).
- Moving the remaining platform checks out of screens, and a lint rule that
  keeps them out (F-234).
- `apps/mobile/AGENTS.md` and the native UI rules memory updated to the new
  rule.

## Out of scope

- Sheets: `BottomSheetModal.native.tsx` and `SheetBarAction.native.tsx` stay
  native (only the anchored confirmation inside them goes).
- Confirmations: `ConfirmationModal.native.tsx` stays the system alert.
- The iOS date calendar (`NativeDateCalendar.ios.tsx`).
- Bar-button icons: SF Symbols on iOS and Material on Android stay, behind
  `useToolbarIcon`, since the navigation bar is native.
- The polish items the old 56d listed (long-press menus on rows, per-screen
  review). A later item can bring them back as shared work.
- Web; `_layout.web.tsx` only follows the shared tab list. `IS_NATIVE_LIST`
  stays: it separates the phones from the drawn web form, not iOS from
  Android.
- Physical-device qualification (40e4b).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

Work in a worktree on `feature/56d-platform-consolidation` cut from
`origin/dev` (see `AGENTS.md`). Each visual step ends with iOS Simulator and
Android emulator screenshots, light and dark, of the control before and after.

## Build steps

- [x] **Step 1 - One tab list, and Android's tab error screen** - a pure
      `src/shared/navigation/app-tabs.ts` holds each tab's name, label, SF
      Symbols, Material icon and the gate flag that shows it, with
      `visibleAppTabs(gate)`. The iOS, Android and web layouts map over it;
      the Android and web layouts re-export `ErrorBoundary`. A test checks
      `visibleAppTabs` for each role's gate and that every `.ios`,
      `.android`, `.native` and `.web` file exports the names its base
      exports. _Done when:_ the tests pass and fail on today's
      `_layout.android.tsx`; both phones show the same tabs for staff and an
      admin; a thrown render in a tab on the Android emulator shows "This tab
      ran into a problem" with Try again.
- [x] **Step 2 - `HeaderBarAction`** - a shared bar button in
      `src/shared/navigation/` taking `label`, `sfSymbol`, `materialIcon`,
      `placement`, `disabled` and `onPress`: words on iOS, an icon on Android,
      waiting for Android's image. Notifications' Mark all read and People's
      Add person use it, and neither screen imports `Platform` or
      `Stack.Toolbar`. _Done when:_ both buttons look and work as before on
      both phones, and `rg "Stack.Toolbar" src/features` finds nothing.
- [x] **Step 3 - One round header button** - `ChromeIconButton.tsx` draws the
      glass circle where Liquid Glass is available, else the tonal circle
      with a ripple; the `.ios` file is deleted. _Done when:_ the week
      stepper, sheet close and full-page sheet buttons look as before on iOS
      26 and Android, and as the tonal circle on an iOS 18 Simulator.
- [x] **Step 4 - One pick-one and one pick-many mark** - `SelectionCheck` is
      the bare brand checkmark and `SelectionCheckbox` the ring that fills,
      on both phones, each with a `.types.ts`; the three platform files are
      deleted, and `FilterSheet` and the organization switcher show the mark
      only when selected, as iOS does. _Done when:_ the organization switcher, role sheet and filter
      sheets on Android show the checkmark and the ring, and iOS is unchanged.
- [x] **Step 5 - One toast** - `ToastSurface.tsx` becomes the top capsule
      (a rounded box with a title): Liquid Glass where available, else the
      surface card with a hairline; the tone haptic and the polite live
      region on both phones; swipe up to dismiss. The two platform files are
      deleted and the toast tests assert the new card. _Done when:_ success,
      error, warning, info and offline toasts show at the top on both phones,
      clear of the status bar and notch, in light and dark, and over an open
      sheet as they did before.
- [x] **Step 6 - One status symbol** - `ToneSymbol` is the Material icon on
      both phones; `markColor` leaves the props and its callers
      (`StatusBanner`, `SectionNotice`, `ToastSurface`); the `.ios` file is
      deleted. _Done when:_ each tone and the offline notice read clearly in
      banners and toasts, light and dark, on both phones.
- [x] **Step 7 - One tab strip** - `ScrollableTabStripTab.tsx` becomes the
      capsule: glass where available and tinted with the brand when
      selected, else a neutral capsule that turns brand; the count in its
      small circle; Android's ripple. The two platform files are deleted.
      _Done when:_ Alerts, Requests and the filter tags look the same on both
      phones apart from glass and ripple, and `ScrollableTabStrip.test.tsx`
      passes.
- [x] **Step 8 - One segmented switch** - `SegmentedSwitch` draws DubGrid's
      `SegmentedControl` on both phones and the two platform files are
      deleted. _Done when:_ admin Home's My schedule | Team and People's
      filter switch work on both phones and the header holding the switch
      does not grow after first layout.
- [x] **Step 9 - One text field** - `AuthField` and `ProfileTextInput`
      take iOS's form on both phones: a rounded, borderless field on the
      grouped page, the red outline for an error, and Profile's fields as
      grouped rows with the field's name as its placeholder. Android's
      outlined 4dp styles (`rowAndroid`, `inputAndroid` and their focus
      styles) go, and `ProfilePasswordScreen`'s labels follow the iOS form.
      _Done when:_ sign-in, the organization field, the code field, Profile's
      details, Work and password fields look the same on both phones apart
      from the keyboard, light and dark, and type, focus and error behave as
      before.
- [x] **Step 10 - One list form** - section and choice-group titles
      (`ProfileSection`, the choice group, `FilterSheet`, `RequestListSection`)
      use iOS's header on both phones, and `FullPageSheet`'s bar centres its
      title on both (the top inset stays only where the sheet covers the
      status bar). `IS_IOS_LIST` and `IS_ANDROID_LIST` leave `native-list.ts`;
      `ReturnDatePicker` asks a flag exported beside `NativeDateCalendar`
      instead. _Done when:_ no file imports `IS_IOS_LIST` or
      `IS_ANDROID_LIST`, Profile, the filter sheets, Requests and a full-page
      sheet read the same on both phones, light and dark, and the return date
      still opens the iOS calendar on iOS.
- [x] **Step 11 - Native search on both phones** - `ScreenSearch` uses
      `Stack.SearchBar` everywhere, with Android's colors set
      (`headerIconColor`, `textColor`, `hintTextColor`), and exports
      `screenSearchRouteOptions(placeholder)` for the root layout's Alerts
      route. The `.android` file and People's Android `headerGap` go.
      _Done when:_ People and Alerts filter as you type on both phones,
      clearing the field restores the list, the Alerts large title is not
      drawn over on iOS 26, and no file outside `ScreenSearch` names the
      Alerts placeholder.
- [x] **Step 12 - Discard asks in the system alert** - the sheet's close
      button and Person detail's end action confirm through
      `ConfirmationModal`. `AnchoredConfirmation` (both files),
      `anchored-confirmation.ts`, `CAN_ANCHOR_CONFIRMATION` and the anchored
      branch of `ConfirmationModal.native.tsx` are deleted. _Done when:_
      closing an edited sheet and Person detail's end action ask in the
      system alert on both phones, the alert appears over the open sheet on
      iOS 26 (the sheet stays open under it), Keep leaves everything in
      place, and Discard closes without saving.
- [x] **Step 13 - Test the platform files that remain** - the alert's buttons
      and message come from a pure function, and the sheet's open height from
      another, each with tests; then tests import `ConfirmationModal.native`
      directly with `Alert` mocked, covering cancel, destructive, a second
      action, dismiss as cancel, and a failure as a Try again alert, plus a
      render test of `BottomSheetModal.native` through an `@expo/ui` shim.
      _Done when:_ `npm run test:mobile` runs those tests, and each fails
      when its behavior is broken on purpose.
- [x] **Step 14 - Move the last platform checks out of screens** - a
      `KEYBOARD_DISMISS_MODE` constant in `screen-layout.ts` (used by
      `Screen`, the drawn sheet and `AuthShell`), a monospace font token for
      recovery codes, and the calendar share, the iOS-only calendar actions
      and the app lock wording moved into `features/profile/lib`. _Done
      when:_ no `Platform.OS` or `Platform.select` remains in `apps/mobile/app`
      or in any `screens` or `components` folder under
      `apps/mobile/src/features`, outside the tab layouts, and the moved
      behavior is unchanged.
- [x] **Step 15 - The lint rule** - `design/no-platform-branch-in-mobile-ui`
      refuses `Platform.OS`, `Platform.select` and platform-suffixed files in
      `apps/mobile/app` and `apps/mobile/src/features/**/{screens,components}`,
      except `app/(tabs)/_layout.*`, registered in the root
      `eslint.config.mjs`, with rule tests. _Done when:_ `npm run lint` and
      `npm run lint:rules` pass, and the rule fails on a planted
      `Platform.OS` in a screen.
- [x] **Step 16 - Docs and qualification** - `apps/mobile/AGENTS.md` states
      the rule (the native table, the materials, where a platform file is
      allowed); the native UI rules memory marks what 56d reversed; the
      before and after screenshots from steps 3 to 12 go in the review
      packet. _Done when:_ a fresh read of `AGENTS.md` answers "should this
      control be native?" without the spec, `npm run type-check`,
      `npm run test` and `npm run lint` pass, and the screenshots cover each
      changed control on both phones in light and dark.

## Files / areas

- `apps/mobile/app/(tabs)/_layout.tsx`, `_layout.android.tsx`,
  `_layout.web.tsx`; `apps/mobile/app/_layout.tsx` (Alerts search option)
- `apps/mobile/src/shared/navigation/` - `app-tabs.ts` (new),
  `HeaderBarAction.tsx` (new), `useToolbarIcon.ts`
- `apps/mobile/src/shared/components/` - `ChromeIconButton`,
  `SelectionCheck`, `SelectionCheckbox`, `ToneSymbol`, `ToastSurface`,
  `ScrollableTabStripTab`, `SegmentedSwitch`, `ScreenSearch`,
  `AnchoredConfirmation`, `anchored-confirmation.ts`,
  `BottomSheetModal.native.tsx`, `ConfirmationModal.native.tsx`,
  `StatusBanner.tsx`, `screen-layout.ts`, `Screen.tsx`,
  `BottomSheetModalDrawn.tsx`
- Fields and lists: `src/shared/lib/native-list.ts`, `AuthField.tsx`,
  `ProfilePrimitives.tsx`, `ProfilePasswordScreen.tsx`, `FilterSheet.tsx`,
  `RequestListSection.tsx`, `FullPageSheet.tsx`, `ReturnDatePicker.tsx`
- Screens: `NotificationsScreen.tsx`, `PeopleHeaderActions.tsx`,
  `PeopleScreen.tsx`, `PersonDetailScreen.tsx`, `SectionNotice.tsx`,
  `AdminHomeScreen.tsx`, `ProfileCalendarScreen.tsx`,
  `ProfileSecurityScreen.tsx`, `ProfileTwoFactorScreen.tsx`, `AuthShell.tsx`
- Tests: `SegmentedSwitch.test.tsx`, `ScrollableTabStrip.test.tsx`,
  `NotificationsScreen.test.tsx`, `ScheduleScreen.test.tsx`, new tests per
  step; `apps/mobile/vitest.config.mts` and `src/test/shims/` for the
  `@expo/ui` shim
- `eslint-rules/no-platform-branch-in-mobile-ui.mjs` and its test;
  registration in the root `eslint.config.mjs`
- `apps/mobile/AGENTS.md`

Deleted (13): `ChromeIconButton.ios`, `SelectionCheck.ios`,
`SelectionCheck.android`, `SelectionCheckbox.ios`, `ToneSymbol.ios`,
`ToastSurface.ios`, `ToastSurface.android`, `ScrollableTabStripTab.ios`,
`ScrollableTabStripTab.android`, `SegmentedSwitch.ios`,
`SegmentedSwitch.android`, `ScreenSearch.android`, `AnchoredConfirmation.ios`
(plus `AnchoredConfirmation.tsx` and `anchored-confirmation.ts`).

## Data / contracts

No server, API or database change, and no migration.

Load-bearing for later mobile work:

- `AppTab` in `app-tabs.ts`:
  `{ name: "home" | "team" | "requests" | "people" | "profile"; label: string;
sf: { default: SFSymbol; selected: SFSymbol }; material: string;
gate?: "canViewHomeTab" | "canViewTeamSchedule" | "canViewRequestsTab" }`.
  Every tab layout reads it; a new tab is added here only.
- `HeaderBarAction` props: `{ label: string; sfSymbol: SFSymbol;
materialIcon: MaterialIconName; placement: "left" | "right";
disabled?: boolean; onPress: () => void }`. iOS shows the label unless the
  action is icon-only (`iconOnly?: boolean`); Android always shows the icon.
- `ToneSymbolProps` loses `markColor`.
- The platform-file allowlist: `app/(tabs)/_layout.*`,
  `BottomSheetModal.native`, `ConfirmationModal.native`,
  `SheetBarAction.native`, `NativeDateCalendar.ios`. Anything new needs a
  reason in `AGENTS.md`.

## Testing

Test runner: Vitest (`npm run test:mobile`), plus `npm run lint:rules` for
the ESLint rule.

Logic that needs a test:

- `visibleAppTabs(gate)` for staff, admin, a no-Home admin and a locked gate
  (step 1).
- Platform-file export parity (step 1), proven by failing on today's Android
  tab layout.
- The confirmation alert's buttons and message (step 13).
- `design/no-platform-branch-in-mobile-ui` with valid and invalid cases
  (step 15).

After the fold, Vitest resolves the same file each phone runs for the nine
shared controls, so their existing tests cover shipped code. Update the
assertions that described the old drawn fallbacks (toast tone card,
selection disc) rather than deleting the tests.

UI steps ride on screenshots: iOS Simulator (iOS 26, and the installed iOS
18.6 runtime for the non-glass path in steps 3, 5 and 7) and the Android
emulator, light and dark.
The Android emulator froze on 2026-10-31; if it does again, say which steps
lack Android evidence rather than calling them verified.

## Notes for the AI

- Read `apps/mobile/AGENTS.md` (Design System, Modals and sheets, Text
  Scaling) before each step. Keep `fit` tiers: tab and segment labels are
  `fit="compact"`.
- Never set `fontWeight` on a text token; use `mobileTextWeighted`.
- `isLiquidGlassAvailable()` is fixed for a run, so read it once at module
  scope as the current files do.
- Delete a platform file only in the step that replaces it, and run
  `npm run type-check` from the worktree: TypeScript checks callers against
  the base file only, so the step 1 parity test is the guard for the rest.
- Stage exact paths and commit in one shell invocation from the worktree.
- The discard alert keeps each confirmation's wording.
- Android keeps DubGrid's brand colors in the search bar and every control.
- If `Stack.SearchBar` misbehaves on Android with native tabs (focus,
  keyboard, back), stop and report it rather than restoring the docked bar
  silently: that is an owner decision.

## Outcome

Built 2026-11-09 on `feature/56d-platform-consolidation`.

- 16 platform files are gone: `ChromeIconButton.ios`, `SelectionCheck.ios`,
  `SelectionCheck.android`, `SelectionCheckbox.ios`, `ToneSymbol.ios`,
  `ToastSurface.ios`, `ToastSurface.android`, `ScrollableTabStripTab.ios`,
  `ScrollableTabStripTab.android`, `SegmentedSwitch.ios`,
  `SegmentedSwitch.android`, `ScreenSearch.android`,
  `AnchoredConfirmation.ios`, plus `AnchoredConfirmation.tsx` and
  `anchored-confirmation.ts`. The platform files left are the allowlist in
  `apps/mobile/AGENTS.md`.
- `IS_IOS_LIST` and `IS_ANDROID_LIST` are gone; Android draws the grouped
  form, rounded fields, dark section titles and a centred full-page sheet
  title, as iOS does.
- Deviations from the steps as written: the selection marks have no
  `.types.ts` (one file each, nothing to share); `KEYBOARD_DISMISS_MODE` and
  the monospace face live in `keyboard-dismiss.ts` and `theme/monospace.ts`,
  since a module-level `Platform` read in `screen-layout.ts` or `tokens.ts`
  broke tests that mock `Platform` lazily; the return date row is the grouped
  row on both phones, with the system calendar on iOS and the app's month
  grid on Android; no render test of `BottomSheetModal.native` through an
  `@expo/ui` shim (its sizing is a tested pure function instead).
- Evidence: `npm run type-check`, `npm run lint`, `npm run lint:rules` (69
  pass) and the mobile Vitest suite (194 files, 1634 tests) passed; screenshots
  on the iOS 26 Simulator, an iOS 18.6 Simulator (step 3's tonal circle) and
  an Android 17 emulator, light and dark, covered each changed control.
  Not covered: the toast over an open sheet, and the offline toast on iOS.
