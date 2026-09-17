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

### Authenticated

Captured on 2026-09-17 from a signed-in session on the iPhone 17 Pro
simulator (light, default text; the local debug build cannot reach dark
mode, see above). The remaining cells are listed with the roles and checks
they need; run `scripts/mobile-matrix.sh <screen>-<role>` per screen.

| Cell                                                                                         | Status   | Shows                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dashboard-ios-light-default-admin                                                            | captured | Two-word greeting and period; toggle track in the theme ground; Your schedule first, its strip on the page with no card; one Coverage card (figure, three focus-area meters, centred stats at the foot); See all on every card; rows as text, no pills |
| coverage-list-ios-light-default-admin                                                        | captured | Coverage See all: back, title, "1 section" with Filter, the same focus-area rows                                                                                                                                                                       |
| my-schedule-ios-light-default-admin                                                          | captured | Your schedule See all: the staff home on the brand aurora through its header, hero, Your Week card                                                                                                                                                     |
| open-shifts-list-ios-light-default-admin                                                     | captured | Open shifts See all: "6 shifts" with Filter, rows as text with the count and urgency word; a row lands on Requests, Available                                                                                                                          |
| dashboard-skeleton-ios-light-default-admin                                                   | captured | Caught while Metro rebundled: the page's placeholder before `f0509e2b`, so it shows the collapsed percentage lines that commit fixed                                                                                                                   |
| schedule-team-ios-light-default-admin                                                        | captured | Date title at `screenTitle` beside Today and the bell; 36pt tab pills; avatar initials sized to their circle                                                                                                                                           |
| shift-detail-ios-light-default-user                                                          | captured | Drop shift / Swap actions; Working with rows                                                                                                                                                                                                           |
| requests-ios-light-default-admin                                                             | captured | Empty Available list                                                                                                                                                                                                                                   |
| people-ios-light-default-admin                                                               | captured | 44pt search, filter and add controls on one baseline; initials no longer shrink                                                                                                                                                                        |
| profile-ios-light-default-admin                                                              | captured | Hero, grouped rows with outline glyphs                                                                                                                                                                                                                 |
| alerts-ios-light-default-admin                                                               | captured | Mailbox rows: unread dot, filled alert glyph for high priority, time, two-line message                                                                                                                                                                 |
| alerts-swipe-ios-light-default-admin                                                         | captured | A row swiped left revealing Read and Archive                                                                                                                                                                                                           |
| request-sheet-\* (drop, pickup, call-off confirmation, error)                                | pending  | Open your own shift, Drop shift; needs the request flow driven by hand                                                                                                                                                                                 |
| swap-sheet-\* (open, target chosen, discard)                                                 | pending  | Open your own shift, Swap                                                                                                                                                                                                                              |
| dashboard empty; schedule-home (user role); person edit; confirmation; devices; tabs-android | pending  | As in the table below                                                                                                                                                                                                                                  |

## Defects found while capturing

Recorded in `blueprint/context/findings.md` with an ID, or fixed in place and
noted in the archive of the feature that captured them.

- 2026-09-17, login-ios-light-ax: the "Need help with your subdomain?" link
  truncated to "subdom…" at accessibility sizes. Fixed in place: link-tone
  `Button` labels wrap to two lines (filled buttons stay on one).
- 2026-09-17, environment: the local iOS native project pins light mode (see
  above). Not a repository defect; documented rather than logged.
- 2026-09-17, schedule-team: "Tomorrow, Sep 18" truncated to "Tomorrow, Se…"
  at `display` size beside the Today button. Fixed in place: schedule date
  titles use `screenTitle`.
- 2026-09-17, people and schedule: avatar initials rendered at a fraction of
  their circle ("CH" in a 48pt circle). Fixed in place: initials no longer
  `adjustsFontSizeToFit`.
- 2026-09-17, dashboard (design review on device): header overloaded, pills
  everywhere, expand glyph on Your schedule. Fixed in place, see the
  minimalist-dashboard fix archive.
- 2026-09-17, alerts (design review on device): cards with inline buttons.
  Replaced by mailbox rows with swipe actions; then one open swipe at a
  time, a gap before the actions, and rows bleeding to the screen edge.
- 2026-09-17, dashboard (design review on device, eight rounds): tinted cards
  read as borders, coloured halos as a rainbow, a multi-stop wash likewise.
  Settled on the login page's aurora in the coverage colour alone, deep
  hues so red stays red.
- 2026-09-17, dashboard (design review on device): grey toggle track read as
  a patch on the wash; two coverage cards said the same thing. Track filled
  with the theme ground; one Coverage card with the focus-area breakdown
  inside; Your schedule moved to the top and its strip taken out of its card,
  the pills flat; the headline under the toggle dropped as a repeat of the
  Coverage card.
- 2026-09-17, dashboard (device pass): the shift strip's shadow room grew
  its ScrollView over the "See all" row and swallowed the taps. Fixed in
  place: 8pt of room above, 20pt below.
- 2026-09-17, skeletons app-wide: the alerts placeholder still drew cards, the
  request placeholder an icon the cards no longer have, people rows three
  lines, team rows a 44pt avatar and a round arrow, dashboard rows badges;
  and every percentage-wide line laid out in a row collapsed to nothing.
  Fixed in place, see the dashboard-status-wash archive's follow-ups.
- 2026-09-17, requests, Available (observation, open): "Evening Shift" wraps
  to two lines beside its time in the card header at default text size.
  Not changed in this pass.
- 2026-09-17, alerts (observation, open): the list is a root stack screen
  with its header hidden and draws no back control of its own, so leaving it
  relies on the iOS edge swipe; the alert detail does draw one. Not changed
  in this pass.
