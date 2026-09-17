# Mobile qualification matrix

Screenshots behind build-plan item 38 (mobile UI consistency), one PNG per
cell, downscaled to 800px wide. Compare a new capture against the one here
before changing a shared primitive.

## Capture

- iOS: boot a simulator, run the app from Metro, drive it to the screen, then
  `scripts/mobile-matrix.sh <screen>[-<role>]` for the four appearance cells
  (light/dark × default/accessibility-extra-large), or
  `scripts/mobile-shot.sh <cell>` for one.
- Android: with the emulator connected, `scripts/mobile-shot.sh --android <cell>`.
  Flip theme and font scale in the emulator's Settings (Display → Dark theme,
  Display → Font size) between shots.
- Cell names: `<screen>-<platform>-<theme>-<scale>[-<role>|-<state>]`.

Sign-in uses the seeded QA account described in the local verification
recipe; never a personal login.

## Axes

| Axis   | Values                                                                  |
| ------ | ----------------------------------------------------------------------- |
| Role   | super_admin, admin, user, management-only user                          |
| Theme  | light, dark                                                             |
| Scale  | default (`large`), ax (`accessibility-extra-large`)                     |
| Device | iPhone 17 Pro (primary), iPhone SE-class, iPhone 17 Pro Max, Android    |
| State  | loaded, loading (skeleton), empty, error, sheet open, confirmation open |

## Cells

Status: `captured` (file present), `pending` (needs an authenticated
session; steps given), `n/a`.

### Unauthenticated

| Cell                                 | Status   | Shows                                                                   |
| ------------------------------------ | -------- | ----------------------------------------------------------------------- |
| onboarding-consent-ios-light-default | captured | First slide behind the consent sheet; "Skip" at label size (A3)         |
| onboarding-consent-ios-light-ax      | captured | Copy wraps, both consent actions stay one line                          |
| onboarding-consent-ios-dark-\*       | pending  | See "iOS dark mode" below                                               |
| login-ios-light-default              | captured | Subdomain stage: `display` title, 52pt field with suffix, link below    |
| login-ios-light-ax                   | captured | Suffix fits, link wraps to two lines instead of truncating (fixed here) |
| login-ios-dark-\*                    | pending  | See "iOS dark mode" below                                               |
| login-android-light-default          | captured | Credentials stage on the emulator, org remembered                       |
| login-android-dark-default           | captured | Dark theme via `adb shell cmd uimode night yes`                         |
| onboarding-android-\*                | pending  | Needs a first-run reset: `npm run db:reset:mobile` clears app storage   |

**iOS dark mode.** The locally prebuilt native project (`apps/mobile/ios/`,
gitignored) carries `UIUserInterfaceStyle = Light`, so the installed debug
build ignores the simulator's appearance switch even though `app.json` says
`automatic`. Regenerate it (`npx expo prebuild --clean --platform ios`) and
rebuild before capturing dark cells, or set Profile > Appearance to Dark in
the app for an authenticated session. EAS builds prebuild from `app.json`
and are unaffected.

**First run on iOS.** `hasSeenOnboarding` lives in the keychain and survives
an uninstall; `xcrun simctl keychain booted reset` (or the dev-only
long-press on the login wordmark) brings onboarding back.

### Authenticated (pending a signed-in session)

For each role, sign in, then run `scripts/mobile-matrix.sh <screen>-<role>`
on each screen. The skeleton cell is the same screen captured during a
cold start or pull-to-refresh; the sheet cells need the sheet opened first.

| Screen        | Role(s)            | Cells per role                                 | What to check                                                                                                                                            |
| ------------- | ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dashboard     | admin, super_admin | loaded ×4 appearance, skeleton, empty          | Greeting at `display`; hero figure + meter + two chips; cards with header-right See all, 3 rows, chevrons; skeleton starts below the Dynamic Island (A1) |
| schedule-home | user               | loaded ×4, skeleton                            | Hero card, upcoming rows at `title`/`cardTitle`; skeleton below the status bar                                                                           |
| schedule-team | admin, user        | loaded ×4, skeleton, focus-area-from-dashboard | Tab strip pills at 36pt; opening from a coverage row selects that focus area                                                                             |
| shift-detail  | user               | loaded ×4                                      | Drop/Swap actions; request pills on the ramp                                                                                                             |
| request-sheet | user               | drop, pickup, call-off confirmation, error     | Bottom sheet; Close visible while pending; inline error; call-off is the only confirmation                                                               |
| swap-sheet    | user               | open, target chosen, discard confirmation      | Full-page card sheet; swipe-down; Discard question only after a target is chosen                                                                         |
| requests      | user, admin        | available, approval, history                   | Pickup/Swap/Time off badges match Home                                                                                                                   |
| people        | admin              | loaded ×4, search focused                      | Search bar at 44pt beside a 44pt filter control                                                                                                          |
| person        | admin              | loaded ×4, edit                                | Inputs at the `input` type step                                                                                                                          |
| profile       | user               | loaded ×4                                      | Card titles at `title`; badges fill-only                                                                                                                 |
| confirmation  | any                | one, light and dark                            | Icon badge without stroke; equal space above and below the buttons                                                                                       |
| tabs-android  | any                | home, schedule                                 | FloatingTabBar clearance with gesture navigation                                                                                                         |
| devices       | admin              | dashboard on SE-class and Pro Max              | Nothing clips at either width                                                                                                                            |

## Defects found while capturing

Recorded in `blueprint/context/findings.md` with an ID, or fixed in place and
noted in the archive of the feature that captured them.

- 2026-09-17, login-ios-light-ax: the "Need help with your subdomain?" link
  truncated to "subdom…" at accessibility sizes. Fixed in place: link-tone
  `Button` labels wrap to two lines (filled buttons stay on one).
- 2026-09-17, environment: the local iOS native project pins light mode (see
  above). Not a repository defect; documented rather than logged.
