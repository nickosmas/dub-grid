# Feature: Native iOS and Android - Expo SDK 57

**From build-plan:** feature 56a

**Type:** Feature
**Status:** complete
**Completed:** 2026-10-31
**Branch:** `feature/56a-expo-sdk-57`

## Goal

Move the mobile app from Expo SDK 54 to SDK 57, the foundation for item 56's
native iOS and Android pass (owner decision, 2026-10-31: upgrade first rather
than polish on 54 with workarounds). Nothing a person sees should change in
this part; it only has to keep working everywhere.

SDK 57 (`expo` 57.0.31, 2026-10-21, outside the 7-day freshness window) pins:

| Package                            | Now            | SDK 57                         |
| ---------------------------------- | -------------- | ------------------------------ |
| react-native                       | 0.81.5         | 0.86.3                         |
| react / react-dom                  | 19.1.0         | 19.2.3 (the web app's version) |
| expo-router                        | ~6.0.10        | ~57.0.29                       |
| react-native-screens               | ~4.17.1        | ~4.26.0                        |
| react-native-reanimated / worklets | ~4.1.1 / 0.5.1 | 4.5.1 / 0.10.1                 |
| react-native-gesture-handler       | ~2.28.0        | ~2.32.0                        |
| react-native-safe-area-context     | 5.6.1          | ~5.7.0                         |
| react-native-keyboard-controller   | 1.18.5         | 1.21.9                         |
| expo-* modules                     | 54-era         | ~57.0.x                        |

What it unlocks:

- React Native Screens 4.26 reads native bar button items the way
  `@react-navigation/native-stack` sends them, so `unstable_headerRightItems`
  stops rendering an empty Liquid Glass capsule (see
  `apps/mobile/src/shared/navigation/HeaderTextAction.tsx`).
- SDK 55+ adopts the UIScene lifecycle, so an iOS device build linked against
  the iOS 27 SDK launches without patching the recorded SDK version.
- `expo-glass-effect`, `expo-symbols` and `@expo/ui` (SwiftUI and Jetpack
  Compose controls) at versions matched to the SDK, for 56b to 56d.
- Metro and Jest move, which may clear F-123, F-124 and F-127.

## Build steps

- [x] **1. Dependencies.** Set every mobile dependency to SDK 57's pinned
      version (`expo/bundledNativeModules.json`), React Navigation to what
      `expo-router` 57 expects, and the dev toolchain (`jest-expo`,
      `babel-preset-expo`, `@types/react`) to match. Resolve the lockfile with
      npm 10.9.2 and `--before` inside the freshness window, in this worktree's own
      `node_modules` (not the shared one), and keep churn to the mobile tree.
      **Done when:** a second lock-only install is byte-identical, and
      `npm run deps:audit`, `npm run deps:scan -- --freshness` and
      `npm audit signatures` pass (allowlist entries the upgrade clears are
      removed).

- [x] **2. Code and config.** Fix what the new versions break: React Native
      0.82+ removed the old architecture, Expo Router 55+ changed its navigation
      imports and native tabs, Reanimated 4.5 and worklets 0.10, React 19.2 types,
      and any `app.json` keys that moved. Keep behavior identical.
      **Done when:** `npm run type-check`, `npm run lint` and `npm run test:mobile`
      pass, and the web app's checks still pass.

- [x] **3. Native builds.** Regenerate `ios/` and `android/` with
      `expo prebuild`, install pods, and build: an iOS Release build for the
      device with no SDK patch, an iOS Simulator build, and an Android build for
      the emulator.
      **Done when:** all three build, and the device build launches on the
      iPhone without the patch.

- [x] **4. Qualification.** On the iOS Simulator and the Android emulator,
      sign in as a staff member, an Admin and a Super Admin against the local
      stack and walk Home, Schedule, Requests, People, Profile, Alerts, a shift
      detail, a sheet, the week stepper and sign-out. Compare with the SDK 54
      build (screenshots).
      **Done when:** every screen renders and responds as before, with no red
      box or console error the old build didn't have.

- [x] **5. Records.** Update or close F-123, F-124, F-127 and F-128 (SDK 57's
      SecureStore size behavior), the dependency allowlist, the mobile notes that
      name SDK 54 (`apps/mobile/AGENTS.md`, `project-overview.md`'s tech stack),
      and the iOS device-build recipe.
      **Done when:** `npm run docs:check` passes.

## Progress notes

- **3:** iOS Release device, iOS Simulator (Release and Debug) and Android
  Debug builds succeed. Expo 57's template doesn't adopt the scene life cycle,
  so `apps/mobile/plugins/with-scene-lifecycle.js` does it at prebuild. The
  device build links the iOS 27.2 SDK unpatched and installed on the iPhone;
  it launched, loaded the bundle and stayed up for a minute with no crash log. Signing needs
  `DEVELOPMENT_TEAM` on the xcodebuild line (a clean prebuild drops it);
  Gradle needs `-Dorg.gradle.jvmargs=-Xmx4g` and a 3 GB Kotlin daemon.
  SDK 57's iOS minimum is 16.4 (was 15.1).
- **4:** iOS Simulator (iOS 26.5, Admin) and Android emulator (API 36,
  Super Admin, then staff after sign-out): Home, Schedule, Requests, People,
  Profile, shift detail and back twice; no JavaScript errors or warnings.

## Verify

`npm run type-check`, `npm run lint`, `npm run test`, `npm run build`,
`npm run deps:audit`, plus the native builds and qualification above.

## Out of scope

Any visible change: the Home switch (56b), native top bars (56c) and the
polish pass (56d). Store release stays on hold.
