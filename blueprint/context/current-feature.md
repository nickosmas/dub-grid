# Feature: Native iOS and Android - Native top bars

**From build-plan:** feature 56c
**Status:** in progress
**Branch:** `feature/56c-native-top-bars`

## Goal

The app's top-level controls use each platform's own chrome (owner, 2026-10-31:
"move the add person and filter buttons in people page to the top nav bar like
the edit button in profile", "make the top buttons in home, schedule pages
liquid glass"):

- **Home and Schedule header buttons** (previous week, next week, back to
  today, alerts) are Liquid Glass on iOS 26 (`expo-glass-effect`'s interactive
  `GlassView`, with the surface circle on older iOS) and Material 3 filled
  tonal icon buttons with a ripple on Android, through one shared
  `ChromeIconButton`.
- **People** moves its search, Filter and Add person into the native
  navigation bar: the system search field (`Stack.SearchBar`), and bar buttons
  (`Stack.Toolbar`) with the active filter count as Filter's badge. iOS uses SF
  Symbols; Android draws Material icons to images, which its toolbar needs.
- **Android's bottom navigation** is Material 3's own (`NativeTabs` with
  Material Symbols, the brand pill indicator) in place of the floating tab bar,
  which is removed. Tab screens pad for a bar in the layout rather than one
  floating over it.

Dependencies: `expo-glass-effect` ~57.0.4 and `expo-symbols` ~57.0.3 (Material
Symbols for Android tabs), both SDK 57 pins outside the freshness window.

## Build steps

- [x] **1. Dependencies** - `expo-glass-effect` and `expo-symbols` as direct
      dependencies, so their native modules link.
- [x] **2. `ChromeIconButton`** - `.tsx` (Material tonal) and `.ios.tsx`
      (Liquid Glass), used by `WeekNavigatorHeader`'s week buttons and the
      alerts bell.
- [x] **3. People header** - `PeopleHeaderActions` with `Stack.SearchBar` and
      a right `Stack.Toolbar`; the in-page search row, `AddPersonButton` and
      their styles go. `useToolbarIcon` picks an SF Symbol or a Material image.
- [x] **4. Android bottom navigation** - `_layout.android.tsx` on
      `NativeTabs`; `FloatingTabBar` and its layout math are removed;
      `screen-layout` pads Android tab screens with breathing room only.
- [ ] **5. Evidence** - iOS Simulator and Android emulator screenshots: Home's
      glass buttons, People's bar buttons, search and filter badge, Android's
      bottom navigation, light and dark.

## Verify

`npm run type-check`, `npm run lint`, `npm run test:mobile`, the dependency
gates, and native builds on both platforms.

## Out of scope

Requests and Profile headers (Profile's Edit is already a glass bar button),
sheets' close buttons, and the polish pass (56d).
