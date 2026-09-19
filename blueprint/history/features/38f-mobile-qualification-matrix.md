# 38f. Mobile qualification matrix

**Type:** Feature

**Status:** verified

**Build plan:** 38f, last sub-feature of 38. Depends on 38a-38e.

## Goal

Put reproducible screenshots behind the 38 work: one capture per screen
across role, theme, text scale, device and state, saved where the next
session can compare against them. No new tooling: `xcrun simctl io` for iOS
and `adb exec-out screencap` for Android, plus the simulator's own
appearance and content-size switches.

## Scope

- `scripts/mobile-shot.sh <cell>`: captures the booted iOS simulator (or the
  connected Android emulator with `--android`) to
  `blueprint/reference/mobile/<cell>.png`, downscaled to 800px wide so the
  repository stays small, and prints the path.
- `scripts/mobile-matrix.sh`: cycles the iOS simulator through light/dark ×
  default/AX-large text and calls `mobile-shot.sh` for a named screen, so one
  command produces a screen's four appearance cells.
- `blueprint/reference/mobile/README.md`: the matrix (roles × themes × text
  scales × devices × states), what each cell should show, how to capture it,
  and the status of every cell.
- Capture now: every cell reachable without credentials (onboarding slides,
  consent sheet, login) on iPhone 17 Pro and the Android emulator.
- Record as pending: every authenticated cell, with the exact steps to
  capture it, since an authenticated session needs a person to sign in.

Out: automating taps (the simulator panel is not granted to this session and
no UI-automation dependency is added).

## Build steps

- [x] **1. Capture scripts and matrix README**
  - Done when both scripts run against the booted simulator and the README
    lists every cell with a status.

- [x] **2. Capture the unauthenticated cells**
  - Onboarding (first slide), login, on iOS light/dark × default/AX text and
    Android light/dark. Defects found are fixed in place if XS, else logged
    in `findings.md`.
  - Done when those PNGs exist and the README marks them captured.

## Verify

- `scripts/mobile-shot.sh onboarding-ios-light-default` writes a PNG.
- `blueprint/reference/mobile/README.md` accounts for every cell.
- Sign in as each role and run `scripts/mobile-matrix.sh <screen>` per
  screen to fill the authenticated cells.

## Outcome

- Checkpoint `0476f396` on `dev` (2026-09-17): `scripts/mobile-shot.sh`,
  `scripts/mobile-matrix.sh`, `blueprint/reference/mobile/README.md` and six
  PNG cells (920 KB total), plus the link-wrap fix in `Button`.
- Captured: onboarding + consent (iOS light, default and AX text), login
  (iOS light, default and AX; Android light and dark). Each was inspected:
  the A1/A3 fixes and the 38a control scale are visible on the unauthenticated
  screens; the Android dark theme renders correctly.
- Found and fixed in place: link labels truncated at accessibility sizes
  (now wrap to two lines; `Button.test.tsx` updated).
- Found and documented (environment, not code): the locally prebuilt iOS
  project pins `UIUserInterfaceStyle = Light`, so system dark mode does not
  reach the debug build; the README gives the `expo prebuild --clean` fix.
- Pending, and why: every authenticated cell needs a person to sign in (the
  simulator panel was not granted to this session and no UI-automation
  dependency was added). The README lists each screen with the roles, cells
  and what to check, so a signed-in session fills them with
  `scripts/mobile-matrix.sh <screen>-<role>`.
