# Current Feature

**Title:** Mobile polish, text-scaling limits and regular-user visibility for launch

**Type:** Fix

**Status:** verified

## The problem

A device pass on the staff and admin apps before launch surfaced a stream of
defects, reported one at a time on 2026-09-19 and landed on `dev` as they were
fixed:

- The native iOS back button was deaf on physical iPhones after a re-push
  (react-native-screens 4.16 on iOS 26), and a JS replacement rendered as two
  glass buttons.
- Contrast and shadow faults: the open-shift count pill vanished on the aurora
  wash, card shadows were cut flat, the shift detail card lost its top shadow.
- Per-cell change classification hung one badge on the wrong pill (web) and
  labelled a newly added second shift "Edited" (mobile); a swap sheet
  appeared and disappeared; an unscheduled week showed both the empty state
  and seven "Unscheduled" rows; the swap picker carried change pills; badges
  differed between Home and Schedule; stacked open shifts expanded in place.
- Text scaling had no ceiling: at accessibility sizes hero titles broke
  mid-word, button labels shrank to a fraction of body copy, pills wrapped
  into lozenges, header dates truncated, and on Android badges stretched into
  ovals because line height scaled past the capped font.
- Chips came in three bordered families around one name; section titles in
  Profile and People were small caps flush with the card; the open-shift deck
  stacked loosely; skeletons did not match the cards they stood in for; the
  Requests feed labelled days with text instead of the Home date tile.
- Regular users saw management information: the seeded user account carried
  an admin permission set the resolver honoured, so web showed them the
  roster's ID, Employment, Account and Access columns and contact details,
  the mobile person detail announced "No app access" for every colleague with
  dead Call and Email buttons, and shift details named who published.
- Web: dashboard cards offered "See all" for lists already shown in full; the
  user dashboard could not tell two open slots on one shift apart; number
  fields had no stepper but could be changed by the mouse wheel.

## The fix

Land each defect as a focused commit on `dev` with a test where the change is
logic, verified on the iOS simulator, the Android emulator and a physical
iPhone dev build, then audit the whole range end to end before completion.
Shared decisions taken with the user: the mobile text contract has three
tiers (`fit="fixed"` chrome, `fit="compact"` labels at 1.2x, reading text at
1.5x under 32pt) and pills never wrap; regular users see directory facts
only; Mine and History on Requests stay flat lists; the admin dashboard keeps
its consolidated open-shift rows.

## Build steps

- [x] **Step 1 - Native back button, shadows, contrast, change badges, swap
      sheet, empty week, stacked open shifts.** `ea5f08cc`, `87c22a64`:
      react-native-screens `~4.17.1` above Expo's pin, elevation extents from
      the token, per-segment alignment in `@dubgrid/schedule-core`, one
      `ShiftChangeBadge`, `FullPageSheet` swipe contract, day sheet for stacked
      open shifts. _Done when:_ mobile and web suites pass; verified on both
      emulators.
- [x] **Step 2 - Text scaling.** `708cce0d`, `7cb56338`, `f1d321ff`,
      `14cb2bb6`, `3a68b011`, `f43234f5`: the shared `Text` primitive with
      `MAX_FONT_SCALE`, `MAX_TEXT_SIZE`, `MAX_FONT_SCALE_COMPACT` and the two
      `fit` tiers, a lint rule against the raw import, Android line height
      capped with the font, squeezed columns stacking at raised sizes. _Done
      when:_ iOS accessibility-extra-large and Android 2.0 hold on every
      touched screen.
- [x] **Step 3 - Chips, headers, section titles, deck, skeletons, date
      rail.** `16e12b85`, `3e6a969c`, `f68b139c`, `ded4f6ec`, `e2bc2f01`,
      `12fa3ae5`, `10eb28eb`, `6fe276cb`, `7a2f6c76`, `f884a773`. _Done
      when:_ visual checks on the iPhone simulator in light and dark.
- [x] **Step 4 - Regular users see only what concerns them.** `1a1594af`,
      `79100a19`: the resolver ignores a stored JSONB for the user role, the
      seed stops writing one, mobile and web detail surfaces drop account,
      contact, employment and publisher information for viewers without the
      permission. _Done when:_ signed in as `qa-regular` on web and iOS the
      Directory shows four columns and a colleague shows Staffing and
      Assignments only.
- [x] **Step 5 - Web dashboards and number fields.** `033a26b8`, `cd816469`,
      `60135cb6`: conditional "See all", per-job open shift titles, the minus
      / value / plus stepper. _Done when:_ Settings > Coverage steps 1 to 3 by
      two clicks and ignores the wheel.
- [x] **Step 6 - End-to-end audit and its repairs.** F-75, F-76, F-78 to F-81
      closed; F-77 stays an unverified lead. _Done when:_ type-check, lint and
      the mobile and web suites pass on the final tree.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:mobile`, `npm run test:web`
  (the pre-push hook runs them; 22/22 tasks green on every push today).
- iOS simulator signed in as `qa-regular@dubgrid.test`: Home, Schedule,
  Requests, People, a colleague, a shift detail at default and
  accessibility-extra-large, light and dark.
- Web signed in as `qa-regular`: Directory columns and cards; as
  `qa-super-admin`: Settings > Coverage stepper.
- Still owed to the user: item 1 (back button) on the physical iPhone dev
  build installed today, and F-77 under quick sheet open/close on that build.

## Findings

### mobile-polish-text-scaling-and-regular-user-visibility/F-75 [P2] closed

Equivalent number badges switched between circles and pills. Found
2026-09-18 by /audit; fixed by feature 23a (one `NumericBadge` contract per
platform from `@dubgrid/design-tokens`). Re-reviewed 2026-09-19: the mobile
badge held its pill shape at a 2.0 Android font scale once `Text` capped line
height (f43234f5).

### mobile-polish-text-scaling-and-regular-user-visibility/F-76 [P1] closed

The Home header date truncated once the Today control appeared. Fixed in
3e6a969c: the Today control is the same 44pt icon chrome as the chevrons, so
the fixed-size title keeps its width. Verified on a non-current week in the
simulator.

### mobile-polish-text-scaling-and-regular-user-visibility/F-78 [P3] closed

The changelog had no entry for the September mobile and alerts work.
`CHANGELOG.md` gains Unreleased entries for alerts going to their subject,
the number badge contract, the Requests date rail, web number steppers, the
text-scaling limits, regular-user visibility, the chip family and the
user-dashboard job names.

### mobile-polish-text-scaling-and-regular-user-visibility/F-79 [P3] closed

Date tile geometry was declared in four places. `SCHEDULE_DATE_TILE_MIN_WIDTH`
and `SCHEDULE_DATE_TILE_MIN_HEIGHT` on `ScheduleDateTile` are the one source;
the Your Week column and both skeletons import them.

### mobile-polish-text-scaling-and-regular-user-visibility/F-80 [P3] closed

`RBAC_SYSTEM_DESIGN.md` described a user role that takes a stored permission
set and `apps/mobile/AGENTS.md` said every dashboard card carries a "See
all". Both documents now match the code landed in 1a1594af and 033a26b8.

### mobile-polish-text-scaling-and-regular-user-visibility/F-81 [P3] closed

Viewers could still fetch who published through the schedule reads.
`canSeeSchedulePublisher` in `apps/web/src/app/api/shared/permissions.ts`
gates `publish-history/recent` and `published-ranges`; `publishedBy` is
nullable end to end and the grid tooltip omits the clause without a resolver.
Route tests cover a viewer (null) and a publisher (id).
