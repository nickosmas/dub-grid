# Fix: the segmented switch is each phone's own control again

**Status:** complete

## Problem

56d drew DubGrid's `SegmentedControl` for the segmented switch on both
phones. The owner wants the platform's own control there (2026-11-10): admin
Home's My schedule | Team and the People filter sheet's On Schedule |
Administrative Teams.

## Fix

- `SegmentedSwitch.ios.tsx` is SwiftUI's segmented picker (UIKit's segmented
  control, Liquid Glass on iOS 26), 32pt tall from the first layout.
- `SegmentedSwitch.android.tsx` is Material 3 segmented buttons in DubGrid's
  brand colors, 40dp tall from the first layout.
- The base `SegmentedSwitch.tsx` stays the drawn control for web and tests.
- `apps/mobile/AGENTS.md` moves the segmented switch to the native column and
  allows the two platform files.

## Evidence

- Type-check, the switch and platform-parity tests, and lint pass.
- iOS 26 Simulator, light and dark: Home switches between My schedule and
  Team, and the filter sheet switches to Administrative Teams.
- Android emulator: Home switches between My schedule and Team.

## Not in this fix

- The People filter sheet doesn't open on the Android emulator, with either
  switch inside it (F-237), so the Android switch in that sheet is unseen.
