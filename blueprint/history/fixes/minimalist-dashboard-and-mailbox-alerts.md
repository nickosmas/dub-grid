# Minimalist dashboard: short greeting, no pills, See all everywhere

**Type:** Fix

**Status:** verified

## The problem

Reviewing the redesigned admin dashboard (38b) on the device, the user
found three things that still read as busy:

1. The header carries a long greeting ("Wrapping up the day, Nic!" wraps to
   two lines), the organization name, the period and a facility-time line.
2. The sections are loaded with pills: a status pill and two chip buttons on
   the hero, a count badge on every card title, a type pill on every
   approval and activity row, an urgency pill and a "needed" pill on every
   open shift, an "OT" pill on every overtime row.
3. "Your schedule" uses an expand glyph where every other card says
   "See all ›".

## The fix

- Greeting is two words ("Morning, Nic!", "Hi, Nic!", "Evening, Nic!";
  "Good morning!" without a name). The meta line is the period only; the
  organization name and facility-time line leave the header (the org is in
  Profile, the clock in Schedule).
- No pills on the dashboard. Hero: the status reads as small tone-coloured
  text over the title; the two figures are plain tappable stats (number and
  label, chevron when they open something) with no fill. Cards: no count
  badge in the header; type, urgency and overtime read as text in the row
  (a tone-coloured strong figure for overtime and urgency, a caption prefix
  for the request and activity type).
- `MyScheduleCard` passes `onSeeAll` to `Card`; `ExpandButton` is deleted.
- Rows keep their chevrons and dividers; meters stay.

## Build steps

- [x] **1. Header and hero**
  - `DashboardHeader` greeting pools and meta; `DashboardHeroCard` status
    text and stat pair; `DashboardSkeleton` follows.
  - Tests updated for the greeting shape and the stat buttons.
  - Done when the header, hero and AdminHome suites pass.

- [x] **2. Cards and rows**
  - Count badges removed from card headers; the four rows and the activity
    row render their facts as text; `MyScheduleCard` uses `onSeeAll`;
    `ExpandButton` removed.
  - Done when the dashboard suites, `type-check` and lint pass.

- [x] **3. Filled icons and avatar initials (added from device review)**
  - Every Ionicons `-outline` name becomes its filled variant; the double
    `checkmark-done` becomes `checkmark`; the tab bar carries the filled glyph
    in both states. Avatar initials drop `adjustsFontSizeToFit`, which shrank
    "CH" to a fraction of its 48pt circle on iOS.
  - Done when the row-icon contract test (now asserting filled) and the full
    suite pass.

- [x] **4. Device-review follow-ups**
  - Only status glyphs are filled (checkmark, alert, info); glyphs that name a
    thing stay outlined; the tab bars keep their state pair. Hero stats are
    centred under a hairline; the coverage figure and meter are omitted when
    nothing is configured. Schedule date titles return to `screenTitle` so
    "Tomorrow, Sep 18" no longer truncates beside the Today button.

- [x] **5. Alerts as a mailbox list**
  - `NotificationRow` replaces the alert cards: one compact row per alert
    (unread dot, title, time, two-line message), hairline dividers, no inline
    buttons. Swipe left reveals Read/Unread and Archive/Restore through
    gesture-handler's `ReanimatedSwipeable` (already a dependency); tapping
    the row still marks it read and opens the detail.
  - The screen wires the read toggle to the existing bulk `read`/`unread`
    actions. A test alias renders the swipe actions inline so they can be
    pressed under vitest.
  - Done when the Notifications suite passes and the list reads as one
    column of rows on the device.

## Verify

- `npx vitest run src/features/dashboard --root apps/mobile`.
- Simulator: the header is one short line plus the period; nothing on the
  dashboard is a pill; every card says "See all ›".

## Outcome

- Commits on `dev` (2026-09-17): `199a7198` (short greeting, no pills, See
  all on Your schedule, filled icons, avatar initials), `3b3ce51b` (icon rule
  narrowed to status glyphs, hero stats centred, coverage omitted when not
  configured), `bad2e0e7` (hairline above the stats, schedule date titles at
  `screenTitle`), `afbb0fbc` (alerts as a mailbox list with swipe actions),
  `1a0dc807` (captured cells).
- Evidence: full mobile suite 140 files / 1135 tests after each commit, mobile
  `type-check` and lint clean, repo-wide checks green in the pre-push hook;
  device screenshots under `blueprint/reference/mobile/` (dashboard, schedule,
  people, alerts and the swiped row) inspected against each change.
