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
| dashboard-ios-light-ax-admin                                                                 | captured | Accessibility extra-large: greeting on one line, the period toggle across the row with every label in full, shift pills grown with the text, coverage figures wrapped under the name                                                                   |
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
| request-sheet-ios-light-default-admin                                                        | captured | Drop shift: title, X outside the pan area, Offer for pickup and Call off, no footer band before a choice                                                                                                                                               |
| shift-detail-ios-light-default-admin                                                         | captured | Your own upcoming shift: Drop shift and Swap as peer controls, Working with rows                                                                                                                                                                       |
| request-sheet-calloff-ios-light-default-admin                                                | captured | Call off chosen: the red card checked, the absence reason chips                                                                                                                                                                                        |
| request-sheet-calloff-review-ios-light-default-admin                                         | captured | A reason chosen: Sick alone under Absence reason, Back and Submit in the footer                                                                                                                                                                        |
| request-sheet-calloff-confirm-ios-light-default-admin                                        | captured | Submit: "Submit this call-off?" drawn inside the sheet, Cancel and Submit Call-off                                                                                                                                                                     |
| request-sheet-pickup-ios-light-default-admin                                                 | captured | Offer for pickup chosen: Offer to everyone, then Request specific person with the teammates off that day                                                                                                                                               |
| request-sheet-pickup-review-ios-light-default-admin                                          | captured | A teammate chosen: the review panel, Back and Submit in the footer                                                                                                                                                                                     |
| request-sheet-\* (error)                                                                     | pending  | A failed submit; needs the API refused by hand                                                                                                                                                                                                         |
| swap-sheet-ios-light-default-admin                                                           | captured | Swap as an iOS page sheet: title with X, Your shift panel, Eligible teammates with the week strip and counts, teammate rows                                                                                                                            |
| swap-sheet-target-ios-light-default-admin                                                    | captured | A target chosen: You give / You get panels, the selection sentence, Back and Submit in the footer                                                                                                                                                      |
| swap-sheet-discard-ios-light-default-admin                                                   | captured | Close with a target chosen: the discard question drawn inside the sheet (Keep Editing / Discard)                                                                                                                                                       |
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
- 2026-09-17, requests, Available: "Evening Shift" wraps to two lines beside
  its time in the card header at default text size. Fixed on 2026-09-18,
  see below.
- 2026-09-17, alerts (observation, open): the list is a root stack screen
  with its header hidden and draws no back control of its own, so leaving it
  relies on the iOS edge swipe; the alert detail does draw one. Fixed on
  2026-09-18, see below.
- 2026-09-17, shift detail (device pass): the drop and swap sheets showed a
  hairline over an empty band under the body before any choice was made.
  Fixed in place: the footer is passed only when it has content.
- 2026-09-17, environment: after a Fast Refresh replaced ShiftDetailScreen
  while the drop sheet was open, its modal host stayed presented and iOS
  refused to present the Swap sheet ("already presenting" in the device
  log). On a clean launch Drop, X, Swap and Swap, X, Drop both hand off
  cleanly. Not a repository defect; relaunch after editing a screen whose
  sheet is open.
- 2026-09-18, swap sheet (device pass): with a target chosen, Close did
  nothing. The discard confirmation was a second root-level Modal, which
  UIKit refuses while the page sheet is up ("already presenting"); nesting
  a Modal inside the sheet was no better, and the sheet's swipe-veto remount
  also ran on Close and tore the card down. Fixed in place: the confirmation
  draws as an overlay inside the sheet (`ConfirmationModal
presentation="inline"`, `FullPageSheet overlay`), and Close no longer
  remounts the card.
- 2026-09-18, every large title (device pass): the Alerts large title never
  collapsed, in the nested stack it used to have and in the root stack alike,
  while People, Requests and the staff profile collapsed. Bisected on device:
  `Screen` swapped its ScrollView for a plain View while a skeleton showed,
  and iOS binds a large title's collapse to the scroll view present when the
  screen appears, so a screen whose data landed after it appeared kept its
  title expanded for good. Fixed in place, app-wide: the ScrollView stays
  mounted for a skeleton and only scrolling, bouncing and pull-to-refresh
  switch off. Alerts verified collapsing on a cold open after the fix.
- 2026-09-18, alerts (device pass): no back control. Fixed in place: the
  alerts list and detail join the root stack, so the list draws the native
  back like every drill-in.
- 2026-09-18, period toggle at accessibility sizes: "D...", "W...", "2 We...".
  Fixed in place: the control takes the row once text is scaled up
  (`SegmentedControl stretch`) and its labels take the app-wide font cap.
  Captured as `dashboard-ios-light-ax-admin`: Day, Week and 2 Weeks all
  read in full.
- 2026-09-18, requests, Available: "Evening Shift" broke beside its time.
  Fixed in place: the time wraps under the name when there is no room.
- 2026-09-18, dashboard at accessibility extra-large: the greeting cut to
  "Morni...", the shift pills to "Day..." and their hour, a coverage row's
  name to its first letter beside its figures. Fixed in place: the strip
  and the coverage rows take the app-wide font cap, the pill width grows
  with the text, the greeting may take two lines, the figures wrap. The
  period toggle still truncates ("D...", "W...", "2 We..."): a segmented
  control stays one line and truncates by the feature 23 rule, left as is.
- 2026-09-18, drop sheet (device pass): Submit on a call-off did nothing on
  device. The "Submit this call-off?" confirmation was a root-level Modal
  while the bottom sheet's own Modal was up, and UIKit refused it. Fixed in
  place: `BottomSheetModal` gained the same `overlay` slot as the page
  sheet, and the shift detail routes both of its confirmations through
  whichever request sheet is showing. Close on the drop sheet has no discard
  question by design: its choices are single taps.
- 2026-09-18, environment: on this dev build the request buttons can take
  several seconds to respond right after the shift detail opens (its queries
  settle first); a tap that lands earlier is dropped. The app console (via
  Metro's inspector) showed no warning or error from the sheets themselves.
