# Fix: Native sweep of the whole mobile app

**Type:** Fix
**Status:** complete
**Completed:** 2026-11-01
**Branch:** `fix/native-sweep-2`

## The problem

Owner, 2026-11-01: after the Team lists and Alerts were made native, sweep every remaining surface "until finished". The inventory found drawn cards, cards inside cards, in-body buttons, outlined capsules and 11 to 12pt text on almost every screen.

## The fix

The work was done in five groups, plus a pass over what each group left:

- **Requests:**
  - One flat card per request: a status capsule with no outline, and the shift as rows of the same card.
  - Actions are tinted rows at the card's foot.
  - Day headers replace the date rail.
  - Load more is a row.
- **Shared and system screens:**
  - `ContentUnavailable` (the iOS ContentUnavailableView look) for empty, error, lock and offline states.
  - A flat `StatusBanner`.
  - Toasts are a glass capsule on iOS and an M3 snackbar on Android.
  - Auth fields are filled on iOS and outlined on Android.
  - The onboarding page control and grouped configuration cards.
- **Person and Profile:**
  - Flat grouped `ProfileList` / `ProfilePanel`.
  - Tinted and red action rows (`ProfileListAction`, `ProfileActionGroup`) at the foot of Person detail.
  - Add to schedule in the bar.
  - Switch rows on Notifications, Security and Privacy.
  - Native Sessions, Two-factor, Password and Appearance.
- **Home and the Schedule tab:**
  - Flat dashboard cards with 17pt group headers.
  - A small spinner beside the week instead of a dimmed scrim.
  - No page wash on device.
  - Open shifts without the fake deck, and card action rows.
  - Inset separators, and outline-free capsules at 13pt.
- **Leftovers:**
  - A flat `SectionNotice` and grouped filter-sheet headers.
  - `FullPageSheet` actions in the native bar.
  - The account-link sheet's actions in the bar.
  - The Cover shifts preview uses day headers.
  - Content text at 13pt or more.
- **iOS sticky header:** no shadow at rest.

**Kept as they were** (owner, the same day, after seeing it):

- the Home hero card
- the Shift detail screen and its What changed sheet
- Person detail's Call and Email pills, status card and No app access banner
- Profile's Switch organization and Sign out buttons

Alert rows keep iOS 26 Mail's swipe, round buttons with labels underneath, and their labels and metadata move to 13pt.

## Verified

- `type-check`, `lint` and the full mobile suite (1540 tests).
- The documentation contract, with re-recorded fingerprints and the lock-screen wording corrected in `mobile-navigation`.
- On the iOS Simulator:
  - Requests History
  - the empty state
  - the Alerts swipe and header
  - Home My schedule and Team
  - Shift detail
  - Person detail
  - Profile
  - Calendar subscription
- Not checked on Android, a phone, onboarding, sign-in, the lock screen, the toast or the swap sheet.
