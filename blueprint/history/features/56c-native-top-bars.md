# Feature: Native iOS and Android - Native top bars

**From build-plan:** feature 56c
**Status:** complete
**Completed:** 2026-10-31
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
  Owner refinements the same day: the search field sits above the list on
  both platforms (iOS's under the large title, Material's docked search bar
  on Android) with little space under it; Add person is on the leading edge
  of the bar and Filter on the trailing one; Filter sits in a glass circle like
  Add person and turns into a filled blue circle with a white icon while any
  filter is on (no count badge); the filter sheet's Schedule | Management switch is the native
  `SegmentedSwitch` (no counts, which native segmented controls can't hold);
  a sheet's sticky buttons sit just above the home indicator; and every
  search field is one design (`ScreenSearch`: the system field under the large
  title on iOS, Material's docked search bar on Android), on People and
  Alerts, replacing the in-page `SearchBar`.

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
- [x] **5. Evidence** - iOS Simulator and Android emulator screenshots: Home's
      glass buttons, People's bar buttons, search and filter badge, Android's
      bottom navigation, light and dark.

## Progress notes

- iOS Simulator (iOS 26.5): Liquid Glass header buttons on Home, People's
  Filter and Add person in a glass capsule with the system search field
  under the large title, the outline Filter icon with a blue count badge, and
  the native switch in the filter sheet.
- Android emulator (API 36): Material tonal header buttons, the Material
  bottom navigation bar (system `navigation_bar_item` views), and People's
  top app bar actions with the docked search bar above the list.
- **Found while verifying:** on Android the native switch's Compose host grew
  after the header's first measurement, so Home's content stayed padded for
  the shorter header and the hero card sat under it. The switch now lays out
  at its final height (40dp on Android, 32pt on iOS) from the start.
- Known: Alerts opened straight from a link on a cold launch draws its large
  title over the search field; opened from the bell it lays out correctly.
  Nothing in the app links to the Alerts list today. Left for 56d.
- The emulator ran slowly enough that Android twice killed a cold Debug start
  as unresponsive while the bundle loaded over its flaky network; not an app
  fault (no crash in the crash buffer), and Wi-Fi off fixed the network.

## Verify

`npm run type-check`, `npm run lint`, `npm run test:mobile`, the dependency
gates, and native builds on both platforms.

## Out of scope

Requests and Profile headers (Profile's Edit is already a glass bar button),
sheets' close buttons, and the polish pass (56d).
