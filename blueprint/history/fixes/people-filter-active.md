# Mobile People filter active appearance

Type: Fix
Status: Implemented locally, uncommitted

The user requested a quick repair for the People filter button looking disabled
when filters are active. The unrelated migration spec and ongoing action-button
work remain owned by their existing tasks.

## Change

`FilterButton` recreates its native Button only when crossing between zero and
nonzero active filters. On the Android emulator, the original native background
stayed gray while the label switched to white. Refreshing the button at that
boundary keeps its background and label consistent. Filter values, sheet state,
and click behavior remain in their existing owners.

The follow-up displays the active count in a 22px circular badge beside `Filter`,
using white text over a translucent white fill on the blue button. Zero active
filters hides the badge. Button exposes a trailing accessory slot for the badge.
The accessible name announces the count with singular/plural wording, and the
component test covers 2, 1, and 0 filters while checking that the button continues
to open the sheet. This replaces the earlier parenthesized count.

## Verification

- Android emulator: reproduced gray background with white text after applying a
  focus-area filter; verified blue/white after the repair, neutral/dark after
  Clear all, and blue/white again after reapplying. The button opens the sheet in
  both states.
- Mobile test suite: 121 files, 954 tests passed.
- Mobile typecheck and `git diff --check`: passed.
- Screenshots: `/Users/nickosmas/.codex/visualizations/2026/09/05/01a0730f-e4c8-7ab1-8962-b7e1bb93ea43/people-filter-verification/`.
- Native iOS was not exercised. No commit or push requested.
