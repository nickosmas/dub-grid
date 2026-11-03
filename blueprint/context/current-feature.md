# Fix: Empty states and skeletons refinement

**Type:** Fix
**Status:** in progress

Design reference: the "Empty states and skeletons" canvas (owner, 2026-11-02 and 2026-11-03), and its "Recommended approach" board.

## The problem

Mobile empty states all look the same: one small gray Ionicon, a title and a line of text. They don't show what is missing, and the ones that ask for a next step ("try clearing your filters", "pull down to try again") offer no control to take it. The Requests Approval tab says "No requests yet" when other tabs have requests.

Mobile skeletons don't match what replaces them. Profile and person detail draw 66 to 70pt rows with full-width dividers against 52pt rows with inset ones, and other screens have similar mismatches.

On web, `EmptyState` draws a dashed border that reads as a drop zone, is used as a loading message in 5 places, and filtered lists that come up empty offer no Clear filters. `.dg-skeleton` sweeps white in dark mode. People, Profile and the staff page show a blank page under the progress bar while loading.

## The fix

Three parts, each its own pull request into `dev`:

1. **Mobile empty states**
   - `EmptyStateCard` takes a `scene` in place of `iconName`. Each empty state has a unique drawing (36 in all) built with `react-native-svg`.
   - Each drawing is one flat gray (`#C7C7CC` light, `#48484A` dark), with details cut out in the surface color. Anything empty is drawn as a dashed outline.
   - People use one set of proportions. Short text appears only where it helps (40h, a date, day letters).
   - The refined copy from the canvas replaces the current copy.
   - A text-only button appears only where the next step is on that screen: Clear filter (activity, open shifts), Clear search (People), Clear filters (alerts), and Try again (Profile).
   - Drawings are hidden from VoiceOver and TalkBack.
   - `ContentUnavailable` stays for system pages that aren't empty states: offline, organization locked, app lock and route error.
2. **Mobile skeletons** follow their content's rows, heights, gaps and dividers. Every skeleton goes through the existing 150/300ms gate.
3. **Web**
   - `EmptyState` loses the dashed border.
   - Filtered lists that can come up empty offer Clear filters.
   - Loading uses skeletons, never `EmptyState`.
   - `.dg-skeleton` gets a dark tone.
   - People, Profile and the staff page get skeletons instead of a blank page.

It must not break:

- Each surface's existing actions, such as Add someone or View full schedule.
- The fill-screen centring of full-page empties.
- The fit tiers for text.

Buttons stay text-only. Staff copy says "the app", never DubGrid.

## Build steps

- [x] 1. **Add `react-native-svg` 15.15.4**, the version Expo SDK 57 bundles.
  - Install it through a lock-only resolve on npm 10.9.2.
  - **Done when:** the lock diff adds only it and its own dependencies, and `deps:scan` and the type-check pass.
- [x] 2. **Scenes module** (`src/shared/components/empty-scene/`).
  - The 36 drawings as data, plus an `EmptyScene` renderer at page size (200 by 140) and card size (0.6x), in the theme's grays.
  - **Done when:** a unit test proves every scene kind renders and none is missing.
- [x] 3. **Wire Home and dashboard:**
  - States: admin Home, Waiting on you, Activity, Activity filtered, Not published, Staffing needs, Coverage, Staff hours, Open shifts, Open shifts filtered.
  - Their copy, plus Clear filter on the two filtered states.
  - **Done when:** the simulator shows each in light and dark.
- [x] 4. **Wire Schedule and shift detail:**
  - States: Team locked, Account not linked, Team day, My week empty, My week finished, Shift not found, No absent teammates, No shifts to swap, Working with.
  - **Done when:** the simulator shows each in light and dark.
- [x] 5. **Wire Requests, People, Add to schedule, Alerts, Profile and Person:**
  - Covers the remaining 17 states.
  - Includes Clear search, Clear filters and Try again.
  - Fixes the Approval tab saying "Nothing to approve".
  - **Done when:** the simulator shows each in light and dark.
- [ ] 6. **Mobile skeleton shapes:**
  - Profile and person detail rows at 52pt with inset dividers.
  - Dashboard list and card skeletons.
  - Admin My schedule shows 7 days.
  - Password and Add to schedule skeletons drawn as their controls.
  - The ungated skeletons go through the gate.
  - **Done when:** each skeleton overlays its loaded screen without a jump.
- [ ] 7. **Web empty states:**
  - No dashed border.
  - Clear filters on Alerts, admin teams and the schedule grid's search.
  - The 5 loading messages become skeletons.
  - **Done when:** screenshots show each, light and dark.
- [ ] 8. **Web skeletons:**
  - A dark `.dg-skeleton` sweep.
  - Skeletons for People, Profile and the staff page.
  - **Done when:** a throttled load shows them in light and dark.

## Verify

- `npm run type-check`, `npm run test:mobile`, `npm run test:web` and `npm run lint` pass.
- **iOS Simulator:** each mobile empty state in light and dark.
- **Web:** a throttled load of People, Profile and the staff page in both themes, plus Alerts with a filter that matches nothing.
