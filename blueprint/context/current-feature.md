# Feature: Native iOS and Android - Admin Home switch

**From build-plan:** feature 56b
**Status:** in progress
**Branch:** `feature/56b-admin-home-switch`

## Goal

An Admin or Super Admin who works shifts no longer scrolls past their own week
to reach the team: a native switch at the top of Home moves between
**My schedule** and **Team** (owner decisions, 2026-10-31).

- **My schedule** reads like the staff Home: next shift, Needs your response,
  Open shifts, Your week.
- **Open shifts** is the staff Home's carousel, showing every gap in the
  admin's scope. Only a card the admin can work (`canVolunteer`) gets the
  full-width Claim; the others show the shift with no button and no "can't
  volunteer" line. Their own call-offs are already left out of the feed.
- **Team** holds Coverage, Pending approvals, Overtime watch and Recent
  activity. Coverage's gap count opens the full open-shifts list.
- No "Your team" label. The dashboard card's small Claim button goes.
- An admin with no shifts of their own (management only, or not linked to a
  staff profile) sees Team alone, with no switch, as today.

## The switch

A shared `SegmentedSwitch` component with one version per platform, so screens
don't fork:

- **iOS:** `@expo/ui`'s SwiftUI `Picker` with `pickerStyle("segmented")`, the
  system segmented control (Liquid Glass on iOS 26).
- **Android:** `@expo/ui`'s Jetpack Compose `SingleChoiceSegmentedButtonRow`,
  Material 3 segmented buttons in DubGrid's brand colors.
- **Web and tests:** a plain pressable pair with `accessibilityRole="tab"`.

It sits in Home's sticky header under the week row, so the week stepper keeps
moving both views. Home opens on My schedule; the choice lasts while the app
is running.

`@expo/ui` ~57.0.26 (2026-10-21, outside the freshness window) is the native
UI library item 56 builds on; it needs a new development build.

## Build steps

- [x] **1. Dependency.** Add `@expo/ui` ~57.0.26 to the mobile app, lockfile
      resolved with npm 10.9.2 inside the freshness window.
      **Done when:** a second lock-only install is byte-identical and
      `deps:audit`, `deps:scan -- --freshness` and `npm audit signatures` pass.

- [x] **2. `SegmentedSwitch`.** `src/shared/components/SegmentedSwitch.tsx`,
      `.ios.tsx` and `.android.tsx` with one API: `options` (`value`, `label`),
      `value`, `onChange`, `accessibilityLabel`. Tests import the base file,
      the JS `SegmentedControl` fallback, so `@expo/ui` needs no shim.
      **Done when:** a test covers selection and its accessible state.

- [x] **3. Home switch and views.** `AdminHomeScreen` renders the switch when
      the admin has a week of their own, My schedule or Team below it, and
      Team alone otherwise. `GroupLabel` and `OpenShiftsCard` leave Home; the
      card's `claim` support and `buildOpenShiftClaim` are removed.
      **Done when:** `AdminHomeScreen.test.tsx` covers both views, the
      management-only case and that switching keeps the week.

- [x] **4. Every-gap carousel.** `OpenShiftsSection` takes `showEveryGap`:
      the feed uses `showAll`, a card the viewer can't work has no button or
      block line. My schedule renders it between Needs your response and
      Your week. `OpenShiftsCard` (now unused) and `hasMyHomeContent` go.
      **Done when:** tests cover an eligible and an ineligible card, and the
      staff Home is unchanged.

- [ ] **5. Skeleton and evidence.** `DashboardSkeleton` draws the switch and
      the My schedule shape. Screenshots on the iOS Simulator and the Android
      emulator: both views, switching, a Claim, Team alone for a
      management-only admin, light and dark.
      **Done when:** the screenshots show each case.

## Verify

`npm run type-check`, `npm run lint`, `npm run test:mobile`, `npm run build`,
the dependency gates, and native builds on both platforms.

## Out of scope

Native top bars (56c), the polish pass (56d), and any server change: the
`/shift-requests` feed already sends an admin every gap with `canVolunteer`.
